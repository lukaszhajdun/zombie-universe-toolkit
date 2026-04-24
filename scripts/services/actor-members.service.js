import {
  createActorReference,
  isSameActorReference
} from "./actor-ref.service.js";

export function getActorMembersArray(actor) {
  return Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
}

export function hasActorMember(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const candidateReference = createActorReference(candidateActor);
  const members = getActorMembersArray(actor);

  return members.some(member => isSameActorReference(member, candidateReference));
}

export async function addActorMember(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (actor.id === candidateActor.id) {
    return { status: "self" };
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
