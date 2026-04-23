import {
  createActorReferencePresentation,
  createActorReference,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

function getPartyMembersArray(actor) {
  return Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
}

export async function preparePartyMembers(actor) {
  const members = getPartyMembersArray(actor);

  return Promise.all(
    members.map(async (member, index) => {
      const resolved = await resolveActorReference(member);

      return {
        index,
        ...createActorReferencePresentation(member, resolved, "ZUT.Party.Members.UnknownName")
      };
    })
  );
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
