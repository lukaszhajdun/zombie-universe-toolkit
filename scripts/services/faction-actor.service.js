import {
  createActorReferencePresentation,
  createActorReference,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

function getFactionKeyFiguresArray(actor) {
  return Array.isArray(actor?.system?.keyFigures) ? [...actor.system.keyFigures] : [];
}

function getFactionActorReferenceArray(actor, path) {
  const collection = foundry.utils.getProperty(actor?.system, path);
  return Array.isArray(collection) ? [...collection] : [];
}

function hasActorReference(list, actorDocument) {
  if (!actorDocument || actorDocument.documentName !== "Actor") return false;

  const candidateReference = createActorReference(actorDocument);
  return list.some(reference => isSameActorReference(reference, candidateReference));
}

export async function prepareFactionKeyFigures(actor) {
  const keyFigures = getFactionKeyFiguresArray(actor);

  return Promise.all(
    keyFigures.map(async (entry, index) => {
      const reference = entry?.actor ?? null;
      const resolved = await resolveActorReference(reference);

      return {
        index,
        role: typeof entry?.role === "string" ? entry.role : "",
        ...createActorReferencePresentation(reference, resolved, "ZUT.Faction.KeyFigures.UnknownName")
      };
    })
  );
}

async function prepareFactionReferenceCollection(actor, systemPath, unknownNameKey) {
  const references = getFactionActorReferenceArray(actor, systemPath);

  return Promise.all(
    references.map(async (reference, index) => {
      const resolved = await resolveActorReference(reference);

      return {
        index,
        ...createActorReferencePresentation(reference, resolved, unknownNameKey)
      };
    })
  );
}

export function prepareFactionHavens(actor) {
  return prepareFactionReferenceCollection(actor, "havens", "ZUT.Faction.Havens.UnknownName");
}

export function prepareFactionChallenges(actor) {
  return prepareFactionReferenceCollection(actor, "challenges", "ZUT.Faction.Challenges.UnknownName");
}

export async function addFactionKeyFigure(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") return { status: "invalid" };
  if (!candidateActor || candidateActor.documentName !== "Actor") return { status: "invalid" };
  if (actor.id === candidateActor.id) return { status: "self" };

  const current = getFactionKeyFiguresArray(actor);
  const currentReferences = current.map(entry => entry?.actor ?? null);

  if (hasActorReference(currentReferences, candidateActor)) {
    return { status: "duplicate" };
  }

  current.push({
    actor: createActorReference(candidateActor),
    role: ""
  });

  await actor.update({ "system.keyFigures": current });

  return {
    status: "added",
    entry: candidateActor
  };
}

async function addFactionActorReference(actor, candidateActor, systemPath) {
  if (!actor || actor.documentName !== "Actor") return { status: "invalid" };
  if (!candidateActor || candidateActor.documentName !== "Actor") return { status: "invalid" };
  if (actor.id === candidateActor.id) return { status: "self" };

  const current = getFactionActorReferenceArray(actor, systemPath);

  if (hasActorReference(current, candidateActor)) {
    return { status: "duplicate" };
  }

  current.push(createActorReference(candidateActor));
  await actor.update({ [`system.${systemPath}`]: current });

  return {
    status: "added",
    entry: candidateActor
  };
}

export function addFactionHaven(actor, candidateActor) {
  return addFactionActorReference(actor, candidateActor, "havens");
}

export function addFactionChallenge(actor, candidateActor) {
  return addFactionActorReference(actor, candidateActor, "challenges");
}

export async function removeFactionKeyFigureByIndex(actor, index) {
  const entries = getFactionKeyFiguresArray(actor);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return;

  entries.splice(index, 1);
  await actor.update({ "system.keyFigures": entries });
}

async function removeFactionActorReferenceByIndex(actor, systemPath, index) {
  const entries = getFactionActorReferenceArray(actor, systemPath);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return;

  entries.splice(index, 1);
  await actor.update({ [`system.${systemPath}`]: entries });
}

export function removeFactionHavenByIndex(actor, index) {
  return removeFactionActorReferenceByIndex(actor, "havens", index);
}

export function removeFactionChallengeByIndex(actor, index) {
  return removeFactionActorReferenceByIndex(actor, "challenges", index);
}
