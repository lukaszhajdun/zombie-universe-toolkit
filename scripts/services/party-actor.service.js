import {
  addActorMember,
  hasActorMember,
  removeActorMemberByIndex
} from "./actor-members.service.js";
import {
  getTwduGroupRollData,
  prepareTwduGroupRollContext,
  prepareTwduGroupRollMembers
} from "./twdu-group-rolls.service.js";

const PARTY_SOURCE_VALUE = "party";
const PARTY_GROUP_ROLL_CONTEXT = Object.freeze({
  aggregateSourceValue: PARTY_SOURCE_VALUE,
  aggregateSourceLabelKey: "ZUT.Sheets.Party.SourceOptions.Party",
  aggregateSourceFallback: "Party",
  memberUnknownNameKey: "ZUT.Party.Members.UnknownName"
});

export async function preparePartyMembers(actor) {
  return prepareTwduGroupRollMembers(actor, PARTY_GROUP_ROLL_CONTEXT);
}

export async function preparePartyContext(actor) {
  return prepareTwduGroupRollContext(actor, PARTY_GROUP_ROLL_CONTEXT);
}

export async function getPartyRollData(actor, kind, key) {
  return getTwduGroupRollData(actor, kind, key, PARTY_GROUP_ROLL_CONTEXT);
}

export function hasPartyMember(actor, candidateActor) {
  return hasActorMember(actor, candidateActor);
}

export async function addPartyMember(actor, candidateActor) {
  return addActorMember(actor, candidateActor);
}

export async function removePartyMemberByIndex(actor, memberIndex) {
  return removeActorMemberByIndex(actor, memberIndex);
}
