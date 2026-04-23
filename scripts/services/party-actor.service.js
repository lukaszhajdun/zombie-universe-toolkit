import {
  getActorTypeLabel,
  createActorReferencePresentation,
  createActorReference,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

const PARTY_SOURCE_VALUE = "party";

const TWDU_ACTOR_TYPES = Object.freeze({
  CHARACTER: "character",
  NPC: "npc"
});

const TWDU_ATTRIBUTES = Object.freeze([
  Object.freeze({ key: "str", labelKey: "twdu.STRENGTH", fallback: "Strength" }),
  Object.freeze({ key: "agl", labelKey: "twdu.AGILITY", fallback: "Agility" }),
  Object.freeze({ key: "wit", labelKey: "twdu.WITS", fallback: "Wits" }),
  Object.freeze({ key: "emp", labelKey: "twdu.EMPATHY", fallback: "Empathy" })
]);

const TWDU_SKILLS = Object.freeze([
  Object.freeze({ key: "closeCombat", attribute: "str", labelKey: "twdu.closeCombat", fallback: "Close Combat" }),
  Object.freeze({ key: "force", attribute: "str", labelKey: "twdu.force", fallback: "Force" }),
  Object.freeze({ key: "endure", attribute: "str", labelKey: "twdu.endure", fallback: "Endure" }),
  Object.freeze({ key: "mobility", attribute: "agl", labelKey: "twdu.mobility", fallback: "Mobility" }),
  Object.freeze({ key: "rangedCombat", attribute: "agl", labelKey: "twdu.rangedCombat", fallback: "Ranged Combat" }),
  Object.freeze({ key: "stealth", attribute: "agl", labelKey: "twdu.stealth", fallback: "Stealth" }),
  Object.freeze({ key: "scout", attribute: "wit", labelKey: "twdu.scout", fallback: "Scout" }),
  Object.freeze({ key: "survival", attribute: "wit", labelKey: "twdu.survival", fallback: "Survival" }),
  Object.freeze({ key: "tech", attribute: "wit", labelKey: "twdu.tech", fallback: "Tech" }),
  Object.freeze({ key: "leadership", attribute: "emp", labelKey: "twdu.leadership", fallback: "Leadership" }),
  Object.freeze({ key: "manipulation", attribute: "emp", labelKey: "twdu.manipulation", fallback: "Manipulation" }),
  Object.freeze({ key: "medicine", attribute: "emp", labelKey: "twdu.medicine", fallback: "Medicine" })
]);

const NPC_SKILL_LEVEL_TO_DICE = Object.freeze({
  base: 4,
  trained: 5,
  expert: 8,
  master: 10
});

function getPartyMembersArray(actor) {
  return Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
}

function getSkillSourceSettings(actor) {
  return {
    enabled: actor?.system?.details?.skillSourceEnabled === true,
    target: String(actor?.system?.details?.skillSourceTarget ?? "").trim()
  };
}

function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function localizeOrFallback(key, fallback) {
  const localized = game.i18n.localize(key);
  return localized !== key ? localized : fallback;
}

function getTwduActorKind(actor) {
  if (actor?.documentName !== "Actor") return null;
  if (actor.type === TWDU_ACTOR_TYPES.CHARACTER) return TWDU_ACTOR_TYPES.CHARACTER;
  if (actor.type === TWDU_ACTOR_TYPES.NPC) return TWDU_ACTOR_TYPES.NPC;
  return null;
}

function getNpcSkillValue(actor, skillKey) {
  const level = String(actor?.system?.skills?.[skillKey]?.level ?? "").trim().toLowerCase();
  return NPC_SKILL_LEVEL_TO_DICE[level] ?? 0;
}

function getMemberSourceValue(reference, index) {
  if (reference?.uuid) return `uuid:${reference.uuid}`;
  if (reference?.id) return `id:${reference.id}`;
  return `member:${index}`;
}

function createUnsupportedPartyMember(index, reference, resolvedActor) {
  const presentation = createActorReferencePresentation(reference, resolvedActor, "ZUT.Party.Members.UnknownName");

  return {
    index,
    sourceValue: getMemberSourceValue(reference, index),
    ...presentation,
    supportedTwdu: false,
    twduActorKind: null,
    twduSnapshot: null
  };
}

function buildTwduMemberSnapshot(member, resolvedActor) {
  const actor = resolvedActor?.documentName === "Actor" ? resolvedActor : null;
  const actorKind = getTwduActorKind(actor);
  if (!actorKind) return null;

  const attributes = Object.fromEntries(
    TWDU_ATTRIBUTES.map(attributeDef => [
      attributeDef.key,
      actorKind === TWDU_ACTOR_TYPES.CHARACTER
        ? normalizeNumber(actor?.system?.attributes?.[attributeDef.key]?.value)
        : null
    ])
  );

  const skills = Object.fromEntries(
    TWDU_SKILLS.map(skillDef => [
      skillDef.key,
      actorKind === TWDU_ACTOR_TYPES.CHARACTER
        ? normalizeNumber(actor?.system?.skills?.[skillDef.key]?.value)
        : getNpcSkillValue(actor, skillDef.key)
    ])
  );

  return {
    member,
    actor,
    actorKind,
    contributorTypeLabel: getActorTypeLabel(actor?.type ?? member.type),
    attributes,
    skills
  };
}

function buildPreparedMember(index, reference, resolvedActor) {
  const presentation = createActorReferencePresentation(reference, resolvedActor, "ZUT.Party.Members.UnknownName");
  const snapshot = buildTwduMemberSnapshot(presentation, resolvedActor);

  if (!snapshot) {
    return createUnsupportedPartyMember(index, reference, resolvedActor);
  }

  return {
    index,
    sourceValue: getMemberSourceValue(reference, index),
    ...presentation,
    supportedTwdu: true,
    twduActorKind: snapshot.actorKind,
    twduSnapshot: snapshot
  };
}

async function loadPreparedMembers(actor) {
  const members = getPartyMembersArray(actor);

  return Promise.all(
    members.map(async (member, index) => {
      const resolvedActor = await resolveActorReference(member);
      return buildPreparedMember(index, member, resolvedActor);
    })
  );
}

function buildSkillSourceOptions(preparedMembers, selectedValue) {
  const options = [
    {
      value: PARTY_SOURCE_VALUE,
      label: game.i18n.localize("ZUT.Sheets.Party.SourceOptions.Party"),
      selected: selectedValue === PARTY_SOURCE_VALUE
    }
  ];

  for (const member of preparedMembers) {
    options.push({
      value: member.sourceValue,
      label: member.name,
      selected: selectedValue === member.sourceValue
    });
  }

  return options;
}

function resolveSelectedSkillSource(preparedMembers, actor) {
  const settings = getSkillSourceSettings(actor);
  const requestedValue = settings.target || PARTY_SOURCE_VALUE;
  const selectedValue = (
    requestedValue === PARTY_SOURCE_VALUE ||
    preparedMembers.some(member => member.sourceValue === requestedValue)
  )
    ? requestedValue
    : PARTY_SOURCE_VALUE;

  const activeValue = settings.enabled ? selectedValue : PARTY_SOURCE_VALUE;
  const selectedMember = activeValue === PARTY_SOURCE_VALUE
    ? null
    : preparedMembers.find(member => member.sourceValue === activeValue) ?? null;

  return {
    enabled: settings.enabled,
    selectedValue,
    activeValue,
    selectedMember,
    options: buildSkillSourceOptions(preparedMembers, selectedValue)
  };
}

function createPartyAggregateAttributeDisplay(attributeDef, memberSnapshots) {
  let bestValue = null;

  for (const snapshot of memberSnapshots) {
    if (snapshot.actorKind !== TWDU_ACTOR_TYPES.CHARACTER) continue;

    const candidateValue = normalizeNumber(snapshot.attributes?.[attributeDef.key]);
    if (bestValue === null || candidateValue > bestValue) {
      bestValue = candidateValue;
    }
  }

  return {
    key: attributeDef.key,
    label: localizeOrFallback(attributeDef.labelKey, attributeDef.fallback),
    testLabel: localizeOrFallback(attributeDef.labelKey, attributeDef.fallback),
    value: bestValue,
    hasValue: bestValue !== null
  };
}

function createPartyAggregateSkillDisplay(skillDef, memberSnapshots, attributeDisplay) {
  let bestValue = null;

  for (const snapshot of memberSnapshots) {
    const candidateValue = normalizeNumber(snapshot.skills?.[skillDef.key]);
    if (bestValue === null || candidateValue > bestValue) {
      bestValue = candidateValue;
    }
  }

  return {
    key: skillDef.key,
    attributeKey: skillDef.attribute,
    label: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
    testLabel: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
    value: bestValue,
    hasValue: bestValue !== null,
    rollAttributeValue: attributeDisplay?.value ?? 0,
    rollSkillValue: bestValue ?? 0
  };
}

function buildPartyAggregateAttributeGroups(memberSnapshots) {
  return TWDU_ATTRIBUTES.map(attributeDef => {
    const attribute = createPartyAggregateAttributeDisplay(attributeDef, memberSnapshots);
    const skills = TWDU_SKILLS
      .filter(skillDef => skillDef.attribute === attributeDef.key)
      .map(skillDef => createPartyAggregateSkillDisplay(skillDef, memberSnapshots, attribute));

    return {
      key: attributeDef.key,
      attribute,
      skills
    };
  });
}

function createSnapshotAttributeDisplay(attributeDef, snapshot) {
  const value = snapshot?.actorKind === TWDU_ACTOR_TYPES.CHARACTER
    ? normalizeNumber(snapshot.attributes?.[attributeDef.key])
    : null;

  return {
    key: attributeDef.key,
    label: localizeOrFallback(attributeDef.labelKey, attributeDef.fallback),
    testLabel: localizeOrFallback(attributeDef.labelKey, attributeDef.fallback),
    value,
    hasValue: value !== null
  };
}

function createSnapshotSkillDisplay(skillDef, snapshot, attributeDisplay) {
  const value = snapshot ? normalizeNumber(snapshot.skills?.[skillDef.key]) : null;

  return {
    key: skillDef.key,
    attributeKey: skillDef.attribute,
    label: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
    testLabel: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
    value,
    hasValue: value !== null,
    rollAttributeValue: attributeDisplay?.value ?? 0,
    rollSkillValue: value ?? 0
  };
}

function buildSnapshotAttributeGroups(snapshot) {
  return TWDU_ATTRIBUTES.map(attributeDef => {
    const attribute = createSnapshotAttributeDisplay(attributeDef, snapshot);
    const skills = TWDU_SKILLS
      .filter(skillDef => skillDef.attribute === attributeDef.key)
      .map(skillDef => createSnapshotSkillDisplay(skillDef, snapshot, attribute));

    return {
      key: attributeDef.key,
      attribute,
      skills
    };
  });
}

function choosePreferredSnapshot(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;

  if (current.actorKind !== candidate.actorKind && candidate.actorKind === TWDU_ACTOR_TYPES.CHARACTER) {
    return candidate;
  }

  return current;
}

function getBestAttributeRollCandidate(attributeKey, memberSnapshots) {
  let best = null;

  for (const snapshot of memberSnapshots) {
    if (snapshot.actorKind !== TWDU_ACTOR_TYPES.CHARACTER) continue;

    const total = normalizeNumber(snapshot.attributes?.[attributeKey]);
    if (!best || total > best.total) {
      best = { snapshot, total };
      continue;
    }

    if (best && total === best.total) {
      best.snapshot = choosePreferredSnapshot(best.snapshot, snapshot);
    }
  }

  return best?.snapshot ?? null;
}

function getSkillRollTotal(snapshot, skillDef) {
  if (!snapshot?.actor) return 0;

  if (snapshot.actorKind === TWDU_ACTOR_TYPES.NPC) {
    return getNpcSkillValue(snapshot.actor, skillDef.key);
  }

  const attributeValue = normalizeNumber(snapshot.attributes?.[skillDef.attribute]);
  const skillValue = normalizeNumber(snapshot.skills?.[skillDef.key]);
  return attributeValue + skillValue;
}

function getBestSkillRollCandidate(skillDef, memberSnapshots) {
  let best = null;

  for (const snapshot of memberSnapshots) {
    const total = getSkillRollTotal(snapshot, skillDef);
    if (!best || total > best.total) {
      best = { snapshot, total };
      continue;
    }

    if (best && total === best.total) {
      best.snapshot = choosePreferredSnapshot(best.snapshot, snapshot);
    }
  }

  return best?.snapshot ?? null;
}

function buildTacticalView(selection, memberSnapshots) {
  if (selection.activeValue === PARTY_SOURCE_VALUE) {
    return {
      sourceLabel: game.i18n.localize("ZUT.Sheets.Party.SourceOptions.Party"),
      hasData: memberSnapshots.length > 0,
      attributeGroups: buildPartyAggregateAttributeGroups(memberSnapshots)
    };
  }

  const snapshot = selection.selectedMember?.twduSnapshot ?? null;

  return {
    sourceLabel: selection.selectedMember?.name ?? "",
    hasData: Boolean(snapshot),
    attributeGroups: buildSnapshotAttributeGroups(snapshot)
  };
}

async function preparePartyState(actor) {
  const members = await loadPreparedMembers(actor);
  const supportedMembers = members.filter(member => member.supportedTwdu === true);
  const memberSnapshots = supportedMembers
    .map(member => member.twduSnapshot)
    .filter(Boolean);
  const selection = resolveSelectedSkillSource(members, actor);
  const tactical = buildTacticalView(selection, memberSnapshots);

  return {
    members,
    supportedMembers,
    memberSnapshots,
    selection,
    tactical
  };
}

export async function preparePartyMembers(actor) {
  const state = await preparePartyState(actor);
  return state.members;
}

export async function preparePartyContext(actor) {
  const state = await preparePartyState(actor);

  return {
    members: state.members,
    hasMembers: state.members.length > 0,
    membersCount: state.members.length,
    supportedMembersCount: state.supportedMembers.length,
    hasSupportedTwduMembers: state.supportedMembers.length > 0,
    skillSourceEnabled: state.selection.enabled,
    skillSourceTarget: state.selection.selectedValue,
    skillSourceOptions: state.selection.options,
    tactical: {
      sourceLabel: state.tactical.sourceLabel,
      attributeGroups: state.tactical.attributeGroups
    },
    hasTacticalData: state.tactical.hasData
  };
}

export async function getPartyRollData(actor, kind, key) {
  const state = await preparePartyState(actor);

  if (state.selection.activeValue === PARTY_SOURCE_VALUE) {
    if (kind === "attribute") {
      const bestSnapshot = getBestAttributeRollCandidate(key, state.memberSnapshots);
      if (!bestSnapshot?.actor) return null;

      return {
        actor: bestSnapshot.actor,
        type: "attribute",
        testName: localizeOrFallback(
          TWDU_ATTRIBUTES.find(attribute => attribute.key === key)?.labelKey ?? key,
          key
        ),
        attName: `twdu.${bestSnapshot.actor.system.attributes[key].label}`,
        attributeDefault: normalizeNumber(bestSnapshot.actor.system.attributes?.[key]?.value)
      };
    }

    if (kind === "skill") {
      const skillDef = TWDU_SKILLS.find(def => def.key === key);
      const bestSnapshot = skillDef ? getBestSkillRollCandidate(skillDef, state.memberSnapshots) : null;
      if (!bestSnapshot?.actor || !skillDef) return null;

      if (bestSnapshot.actorKind === TWDU_ACTOR_TYPES.NPC) {
        return {
          actor: bestSnapshot.actor,
          type: "skill",
          testName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
          skillKey: key,
          skillName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
          skillDefault: getNpcSkillValue(bestSnapshot.actor, key)
        };
      }

      return {
        actor: bestSnapshot.actor,
        type: "skill",
        testName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
        skillKey: key,
        skillName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
        attName: `twdu.${bestSnapshot.actor.system.attributes[skillDef.attribute].label}`,
        attributeDefault: normalizeNumber(bestSnapshot.actor.system.attributes?.[skillDef.attribute]?.value),
        skillDefault: normalizeNumber(bestSnapshot.actor.system.skills?.[key]?.value)
      };
    }

    return null;
  }

  const snapshot = state.selection.selectedMember?.twduSnapshot ?? null;
  if (!snapshot?.actor) return null;

  if (kind === "attribute") {
    if (snapshot.actorKind !== TWDU_ACTOR_TYPES.CHARACTER) return null;

    return {
      actor: snapshot.actor,
      type: "attribute",
      testName: localizeOrFallback(
        TWDU_ATTRIBUTES.find(attribute => attribute.key === key)?.labelKey ?? key,
        key
      ),
      attName: `twdu.${snapshot.actor.system.attributes[key].label}`,
      attributeDefault: normalizeNumber(snapshot.actor.system.attributes?.[key]?.value)
    };
  }

  if (kind === "skill") {
    const skillDef = TWDU_SKILLS.find(def => def.key === key);
    if (!skillDef) return null;

    if (snapshot.actorKind === TWDU_ACTOR_TYPES.NPC) {
      return {
        actor: snapshot.actor,
        type: "skill",
        testName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
        skillKey: key,
        skillName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
        skillDefault: getNpcSkillValue(snapshot.actor, key)
      };
    }

    return {
      actor: snapshot.actor,
      type: "skill",
      testName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
      skillKey: key,
      skillName: localizeOrFallback(skillDef.labelKey, skillDef.fallback),
      attName: `twdu.${snapshot.actor.system.attributes[skillDef.attribute].label}`,
      attributeDefault: normalizeNumber(snapshot.actor.system.attributes?.[skillDef.attribute]?.value),
      skillDefault: normalizeNumber(snapshot.actor.system.skills?.[key]?.value)
    };
  }

  return null;
}

export function hasPartyMember(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const candidateReference = createActorReference(candidateActor);
  const members = getPartyMembersArray(actor);

  return members.some(member => isSameActorReference(member, candidateReference));
}

export async function addPartyMember(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (actor.id === candidateActor.id) {
    return { status: "self" };
  }

  if (hasPartyMember(actor, candidateActor)) {
    return { status: "duplicate" };
  }

  const members = getPartyMembersArray(actor);
  members.push(createActorReference(candidateActor));

  await actor.update({ "system.members": members });

  return {
    status: "added",
    member: candidateActor
  };
}

export async function removePartyMemberByIndex(actor, memberIndex) {
  const members = getPartyMembersArray(actor);
  if (!Number.isInteger(memberIndex)) return;
  if (memberIndex < 0 || memberIndex >= members.length) return;

  members.splice(memberIndex, 1);
  await actor.update({ "system.members": members });
}
