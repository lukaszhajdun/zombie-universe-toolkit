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

export const GROUP_SOURCE_VALUE = "group";
const GROUP_ROLL_CONTEXT = Object.freeze({
  aggregateSourceValue: GROUP_SOURCE_VALUE,
  aggregateSourceLabelKey: "ZUT.Sheets.Group.SourceOptions.Group",
  aggregateSourceFallback: "Group",
  memberUnknownNameKey: "ZUT.Group.Members.UnknownName"
});

export async function prepareGroupMembers(actor) {
  return prepareTwduGroupRollMembers(actor, GROUP_ROLL_CONTEXT);
}

export async function prepareGroupContext(actor) {
  return prepareTwduGroupRollContext(actor, GROUP_ROLL_CONTEXT);
}

export async function getGroupRollData(actor, kind, key) {
  return getTwduGroupRollData(actor, kind, key, GROUP_ROLL_CONTEXT);
}

export function hasGroupMember(actor, candidateActor) {
  return hasActorMember(actor, candidateActor);
}

export async function addGroupMember(actor, candidateActor) {
  return addActorMember(actor, candidateActor);
}

export async function removeGroupMemberByIndex(actor, memberIndex) {
  return removeActorMemberByIndex(actor, memberIndex);
}
