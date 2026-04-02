import {
  createActorReferencePresentation,
  createActorReference,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

function getGroupMembersArray(actor) {
  return Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
}

export async function prepareGroupMembers(actor) {
  const members = getGroupMembersArray(actor);

  return Promise.all(
    members.map(async (member, index) => {
      const resolved = await resolveActorReference(member);

      return {
        index,
        ...createActorReferencePresentation(member, resolved, "ZUT.Group.Members.UnknownName")
      };
    })
  );
}

export function hasGroupMember(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const candidateReference = createActorReference(candidateActor);
  const members = getGroupMembersArray(actor);

  return members.some(member => isSameActorReference(member, candidateReference));
}

export async function addGroupMember(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (actor.id === candidateActor.id) {
    return { status: "self" };
  }

  if (hasGroupMember(actor, candidateActor)) {
    return { status: "duplicate" };
  }

  const members = getGroupMembersArray(actor);
  members.push(createActorReference(candidateActor));

  await actor.update({ "system.members": members });

  return {
    status: "added",
    member: candidateActor
  };
}

export async function removeGroupMemberByIndex(actor, memberIndex) {
  const members = getGroupMembersArray(actor);
  if (!Number.isInteger(memberIndex)) return;
  if (memberIndex < 0 || memberIndex >= members.length) return;

  members.splice(memberIndex, 1);
  await actor.update({ "system.members": members });
}
