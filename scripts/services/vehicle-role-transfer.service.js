import {
  ACTOR_TYPES,
  qualifyModuleActorType
} from "../core/constants.js";
import {
  ACTOR_ROLE_LAYOUT_STORAGE_TYPES,
  transferActorRoleByLayout
} from "./actor-role-layout-transfer.service.js";
import {
  EMPTY_ACTOR_REFERENCE,
  VEHICLE_ROLE_KEYS,
  getVehiclePassengersArray
} from "./vehicle-actor.service.js";

function isActorDocument(actor) {
  return actor?.documentName === "Actor";
}

const VEHICLE_DISALLOWED_TRANSFER_TYPES = Object.freeze(new Set([
  ACTOR_TYPES.GROUP,
  ACTOR_TYPES.FACTION,
  ACTOR_TYPES.VEHICLE,
  qualifyModuleActorType(ACTOR_TYPES.GROUP),
  qualifyModuleActorType(ACTOR_TYPES.FACTION),
  qualifyModuleActorType(ACTOR_TYPES.VEHICLE)
]));

function canAssignVehicleCrewReference(reference) {
  const actorType = String(reference?.type ?? "");
  return !VEHICLE_DISALLOWED_TRANSFER_TYPES.has(actorType);
}

const VEHICLE_ROLE_LAYOUT = Object.freeze({
  roles: Object.freeze({
    [VEHICLE_ROLE_KEYS.OWNER]: Object.freeze({
      storageType: ACTOR_ROLE_LAYOUT_STORAGE_TYPES.SLOT,
      updatePath: "system.owner.actor",
      emptyValue: EMPTY_ACTOR_REFERENCE,
      getValue: actor => actor?.system?.owner?.actor ?? null
    }),
    [VEHICLE_ROLE_KEYS.DRIVER]: Object.freeze({
      storageType: ACTOR_ROLE_LAYOUT_STORAGE_TYPES.SLOT,
      updatePath: "system.driver.actor",
      emptyValue: EMPTY_ACTOR_REFERENCE,
      getValue: actor => actor?.system?.driver?.actor ?? null,
      canAssign: (_actor, reference) => canAssignVehicleCrewReference(reference)
    }),
    [VEHICLE_ROLE_KEYS.PASSENGERS]: Object.freeze({
      storageType: ACTOR_ROLE_LAYOUT_STORAGE_TYPES.LIST,
      updatePath: "system.passengers",
      getValue: actor => getVehiclePassengersArray(actor),
      canAssign: (_actor, reference) => canAssignVehicleCrewReference(reference)
    })
  }),
  operations: Object.freeze({
    "driver:slot:owner:slot": Object.freeze({ type: "slotToSlot", onOccupied: "overwrite", preserveSource: true }),
    "driver:slot:passengers:list": Object.freeze({ type: "slotToList" }),
    "driver:slot:passengers:listItem": Object.freeze({ type: "slotToListItem", onOccupied: "swap" }),
    "passengers:listItem:owner:slot": Object.freeze({ type: "listItemToSlot", onOccupied: "overwrite", preserveSource: true }),
    "passengers:listItem:driver:slot": Object.freeze({ type: "listItemToSlot", onOccupied: "swap" }),
    "passengers:listItem:passengers:list": Object.freeze({ type: "listItemToList" }),
    "passengers:listItem:passengers:listItem": Object.freeze({ type: "listItemToListItem" })
  })
});

export async function transferVehicleActorRole(actor, draggedActor, transferData, target) {
  if (!isActorDocument(actor)) {
    return { status: "invalid" };
  }

  const result = await transferActorRoleByLayout(actor, draggedActor, transferData, target, VEHICLE_ROLE_LAYOUT);

  if (target?.targetRole === VEHICLE_ROLE_KEYS.OWNER && (result.status === "assigned" || result.status === "moved")) {
    return { ...result, status: "ownerAssigned" };
  }

  if (target?.targetRole === VEHICLE_ROLE_KEYS.PASSENGERS && result.status === "moved") {
    return { ...result, status: "movedToPassengers" };
  }

  return result;
}
