import {
  ACTOR_TYPES,
  toModuleActorKey
} from "../core/constants.js";
import {
  createActorReference,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

const SUPPORTED_MEMBER_ACTOR_TYPES = new Set(["character", "npc"]);

export function getActorMembersArray(actor) {
  return Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
}

export function hasActorMember(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const candidateReference = createActorReference(candidateActor);
  const members = getActorMembersArray(actor);

  return members.some(member => isSameActorReference(member, candidateReference));
}

function isSameActorDocument(left, right) {
  if (!left || !right) return false;
  if (left.uuid && right.uuid) return left.uuid === right.uuid;
  if (left.id && right.id) return left.id === right.id;
  return false;
}

function isGroupActor(actor) {
  if (!actor || actor.documentName !== "Actor") return false;

  const actorTypeKey = toModuleActorKey(actor.type) ?? actor.type;
  return actorTypeKey === ACTOR_TYPES.GROUP;
}

function isSupportedMemberActor(actor) {
  return actor?.documentName === "Actor" && SUPPORTED_MEMBER_ACTOR_TYPES.has(actor.type);
}

function hasActorReferenceInList(references, candidateReference) {
  return references.some(reference => isSameActorReference(reference, candidateReference));
}

async function getEligibleGroupMemberActors(actor, groupActor) {
  const currentMembers = getActorMembersArray(actor);
  const groupMembers = getActorMembersArray(groupActor);
  const eligibleActors = [];
  const selectedReferences = [];

  for (const memberReference of groupMembers) {
    const resolvedActor = await resolveActorReference(memberReference);
    if (!resolvedActor || resolvedActor.documentName !== "Actor") continue;
    if (!isSupportedMemberActor(resolvedActor)) continue;

    const resolvedReference = createActorReference(resolvedActor);
    if (hasActorReferenceInList(currentMembers, resolvedReference)) continue;
    if (hasActorReferenceInList(selectedReferences, resolvedReference)) continue;

    eligibleActors.push(resolvedActor);
    selectedReferences.push(resolvedReference);
  }

  return eligibleActors;
}

async function addActorMemberGroup(actor, groupActor) {
  const members = getActorMembersArray(actor);
  const eligibleActors = await getEligibleGroupMemberActors(actor, groupActor);

  if (eligibleActors.length === 0) {
    return {
      status: "groupNoEligible",
      addedCount: 0
    };
  }

  const nextMembers = [
    ...members,
    ...eligibleActors.map(memberActor => createActorReference(memberActor))
  ];

  await actor.update({ "system.members": nextMembers });

  return {
    status: "groupAdded",
    addedCount: eligibleActors.length,
    group: groupActor
  };
}

export async function addActorMember(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (isSameActorDocument(actor, candidateActor)) {
    return { status: "self" };
  }

  if (isGroupActor(candidateActor)) {
    return addActorMemberGroup(actor, candidateActor);
  }

  if (!isSupportedMemberActor(candidateActor)) {
    return { status: "invalidType" };
  }

  if (hasActorMember(actor, candidateActor)) {
    return { status: "duplicate" };
  }

  const members = getActorMembersArray(actor);
  members.push(createActorReference(candidateActor));

  await actor.update({ "system.members": members });

  return {
    status: "added",
    member: candidateActor
  };
}

export async function removeActorMemberByIndex(actor, memberIndex) {
  const members = getActorMembersArray(actor);
  if (!Number.isInteger(memberIndex)) return;
  if (memberIndex < 0 || memberIndex >= members.length) return;

  members.splice(memberIndex, 1);
  await actor.update({ "system.members": members });
}

export async function cleanupActorMemberReferencesForDeletedActor(deletedActor) {
  if (!deletedActor || deletedActor.documentName !== "Actor") {
    return {
      status: "invalidDeletedActor",
      updatedActors: 0,
      removedMembers: 0
    };
  }

  return cleanupActorMemberReferencesForDeletedActorReference(
    createActorReference(deletedActor),
    deletedActor.uuid ?? ""
  );
}

export async function cleanupActorMemberReferencesForDeletedActorReference(deletedReference, deletedActorUuid = "") {
  let updatedActors = 0;
  let removedMembers = 0;

  for (const actor of game.actors ?? []) {
    if (!isGroupActor(actor)) continue;
    if (deletedActorUuid && actor.uuid === deletedActorUuid) continue;

    const members = getActorMembersArray(actor);
    if (!members.length) continue;

    const filteredMembers = members.filter(
      memberReference => !isSameActorReference(memberReference, deletedReference)
    );

    if (filteredMembers.length === members.length) continue;

    await actor.update({ "system.members": filteredMembers });
    updatedActors += 1;
    removedMembers += members.length - filteredMembers.length;
  }

  return {
    status: "cleaned",
    updatedActors,
    removedMembers
  };
}
