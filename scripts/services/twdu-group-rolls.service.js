import {
  getActorTypeLabel,
  createActorReferencePresentation,
  resolveActorReference
} from "./actor-ref.service.js";

const DEFAULT_AGGREGATE_SOURCE_VALUE = "aggregate";

const DEFAULT_TWDU_GROUP_ROLL_CONTEXT = Object.freeze({
  aggregateSourceValue: DEFAULT_AGGREGATE_SOURCE_VALUE,
  aggregateSourceLabelKey: "",
  aggregateSourceFallback: "Group",
  memberUnknownNameKey: "ZUT.Common.Members.UnknownName"
});

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

function getActorMembersArray(actor) {
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
  if (!key) return fallback;

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

function resolveGroupRollContextConfig(config = {}) {
  return {
    ...DEFAULT_TWDU_GROUP_ROLL_CONTEXT,
    ...config
  };
}

function getAggregateSourceLabel(config) {
  return localizeOrFallback(config.aggregateSourceLabelKey, config.aggregateSourceFallback);
}

function createUnsupportedMember(index, reference, resolvedActor, config) {
  const presentation = createActorReferencePresentation(reference, resolvedActor, config.memberUnknownNameKey);

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

function buildPreparedMember(index, reference, resolvedActor, config) {
  const presentation = createActorReferencePresentation(reference, resolvedActor, config.memberUnknownNameKey);
  const snapshot = buildTwduMemberSnapshot(presentation, resolvedActor);

  if (!snapshot) {
    return createUnsupportedMember(index, reference, resolvedActor, config);
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

async function loadPreparedMembers(actor, config) {
  const members = getActorMembersArray(actor);

  return Promise.all(
    members.map(async (member, index) => {
      const resolvedActor = await resolveActorReference(member);
      return buildPreparedMember(index, member, resolvedActor, config);
    })
  );
}

function buildSkillSourceOptions(preparedMembers, selectedValue, config) {
  const options = [
    {
      value: config.aggregateSourceValue,
      label: getAggregateSourceLabel(config),
      selected: selectedValue === config.aggregateSourceValue
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

function resolveSelectedSkillSource(preparedMembers, actor, config) {
  const settings = getSkillSourceSettings(actor);
  const requestedValue = settings.target || config.aggregateSourceValue;
  const selectedValue = (
    requestedValue === config.aggregateSourceValue ||
    preparedMembers.some(member => member.sourceValue === requestedValue)
  )
    ? requestedValue
    : config.aggregateSourceValue;

  const activeValue = settings.enabled ? selectedValue : config.aggregateSourceValue;
  const selectedMember = activeValue === config.aggregateSourceValue
    ? null
    : preparedMembers.find(member => member.sourceValue === activeValue) ?? null;

  return {
    enabled: settings.enabled,
    selectedValue,
    activeValue,
    selectedMember,
    options: buildSkillSourceOptions(preparedMembers, selectedValue, config)
  };
}

function createAggregateAttributeDisplay(attributeDef, memberSnapshots) {
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

function createAggregateSkillDisplay(skillDef, memberSnapshots, attributeDisplay) {
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

function buildAggregateAttributeGroups(memberSnapshots) {
  return TWDU_ATTRIBUTES.map(attributeDef => {
    const attribute = createAggregateAttributeDisplay(attributeDef, memberSnapshots);
    const skills = TWDU_SKILLS
      .filter(skillDef => skillDef.attribute === attributeDef.key)
      .map(skillDef => createAggregateSkillDisplay(skillDef, memberSnapshots, attribute));

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

function buildTacticalView(selection, memberSnapshots, config) {
  if (selection.activeValue === config.aggregateSourceValue) {
    return {
      sourceLabel: getAggregateSourceLabel(config),
      hasData: memberSnapshots.length > 0,
      attributeGroups: buildAggregateAttributeGroups(memberSnapshots)
    };
  }

  const snapshot = selection.selectedMember?.twduSnapshot ?? null;

  return {
    sourceLabel: selection.selectedMember?.name ?? "",
    hasData: Boolean(snapshot),
    attributeGroups: buildSnapshotAttributeGroups(snapshot)
  };
}

async function prepareTwduGroupRollState(actor, config = {}) {
  const contextConfig = resolveGroupRollContextConfig(config);
  const members = await loadPreparedMembers(actor, contextConfig);
  const supportedMembers = members.filter(member => member.supportedTwdu === true);
  const memberSnapshots = supportedMembers
    .map(member => member.twduSnapshot)
    .filter(Boolean);
  const selection = resolveSelectedSkillSource(members, actor, contextConfig);
  const tactical = buildTacticalView(selection, memberSnapshots, contextConfig);

  return {
    config: contextConfig,
    members,
    supportedMembers,
    memberSnapshots,
    selection,
    tactical
  };
}

export async function prepareTwduGroupRollMembers(actor, config = {}) {
  const state = await prepareTwduGroupRollState(actor, config);
  return state.members;
}

export async function prepareTwduGroupRollContext(actor, config = {}) {
  const state = await prepareTwduGroupRollState(actor, config);

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

export async function getTwduGroupRollData(actor, kind, key, config = {}) {
  const state = await prepareTwduGroupRollState(actor, config);

  if (state.selection.activeValue === state.config.aggregateSourceValue) {
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
