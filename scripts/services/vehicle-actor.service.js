import {
  ACTOR_TYPES,
  qualifyModuleActorType,
  toModuleActorKey
} from "../core/constants.js";
import {
  createActorReferencePresentation,
  createActorReference,
  hasStoredActorReference,
  isSameActorReference,
  resolveActorReference
} from "./actor-ref.service.js";

export const EMPTY_ACTOR_REFERENCE = Object.freeze({
  uuid: "",
  id: "",
  name: "",
  img: "",
  type: ""
});

const DISALLOWED_PASSENGER_TYPES = Object.freeze(new Set([
  ACTOR_TYPES.GROUP,
  ACTOR_TYPES.FACTION,
  ACTOR_TYPES.VEHICLE
]));

export const VEHICLE_ROLE_KEYS = Object.freeze({
  OWNER: "owner",
  DRIVER: "driver",
  PASSENGERS: "passengers"
});

export function isVehicleActorDocument(actor) {
  if (!actor || actor.documentName !== "Actor") return false;

  const actorType = actor.type ?? "";
  return actorType === ACTOR_TYPES.VEHICLE || actorType === qualifyModuleActorType(ACTOR_TYPES.VEHICLE);
}

function normalizeActorTypeKey(actorType) {
  if (typeof actorType !== "string" || !actorType.length) return "";

  const moduleActorKey = toModuleActorKey(actorType);
  if (moduleActorKey) return moduleActorKey;

  return actorType;
}

export function isModuleGroupActorDocument(actor) {
  if (!actor || actor.documentName !== "Actor") return false;
  return normalizeActorTypeKey(actor.type) === ACTOR_TYPES.GROUP;
}

export function isVehiclePassengerDisallowedActor(actor) {
  if (!actor || actor.documentName !== "Actor") return true;
  return DISALLOWED_PASSENGER_TYPES.has(normalizeActorTypeKey(actor.type));
}

export function isVehicleDriverDisallowedActor(actor) {
  return isVehiclePassengerDisallowedActor(actor);
}

export function getVehiclePassengersArray(actor) {
  return Array.isArray(actor?.system?.passengers) ? [...actor.system.passengers] : [];
}

function getGroupMembersArray(actor) {
  return Array.isArray(actor?.system?.members) ? [...actor.system.members] : [];
}

function hasActorReferenceInList(references, candidateReference) {
  return references.some(reference => isSameActorReference(reference, candidateReference));
}

export function getVehiclePassengerReferenceByIndex(actor, passengerIndex) {
  const passengers = getVehiclePassengersArray(actor);
  if (!Number.isInteger(passengerIndex)) return null;
  if (passengerIndex < 0 || passengerIndex >= passengers.length) return null;

  const reference = passengers[passengerIndex];
  return hasStoredActorReference(reference) ? reference : null;
}

export function getVehiclePassengerCapacity(actor) {
  const seats = Number(actor?.system?.details?.seats);
  if (!Number.isFinite(seats)) return 0;
  return Math.max(0, Math.floor(seats));
}

export function getVehicleOwnerReference(actor) {
  const reference = actor?.system?.owner?.actor;
  if (!hasStoredActorReference(reference)) return null;
  return reference;
}

export function getVehicleDriverReference(actor) {
  const reference = actor?.system?.driver?.actor;
  if (!hasStoredActorReference(reference)) return null;
  return reference;
}

export function getVehicleRoleSourceReference(actor, sourceRole, sourceIndex = null) {
  switch (sourceRole) {
    case VEHICLE_ROLE_KEYS.DRIVER:
      return getVehicleDriverReference(actor);

    case VEHICLE_ROLE_KEYS.PASSENGERS:
      return getVehiclePassengerReferenceByIndex(actor, sourceIndex);

    default:
      return null;
  }
}

export function doesVehicleRoleSourceMatchActor(actor, sourceRole, sourceIndex, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const reference = getVehicleRoleSourceReference(actor, sourceRole, sourceIndex);
  if (!reference) return false;

  return isSameActorReference(reference, createActorReference(candidateActor));
}

export function getVehicleOccupancyCount(actor) {
  const passengersCount = getVehiclePassengersArray(actor).length;
  const driverCount = getVehicleDriverReference(actor) ? 1 : 0;
  return passengersCount + driverCount;
}

export async function prepareVehicleOwner(actor) {
  const reference = getVehicleOwnerReference(actor);
  if (!reference) return null;

  const resolved = await resolveActorReference(reference);
  return createActorReferencePresentation(reference, resolved, "ZUT.Vehicle.Owner.UnknownName");
}

export async function prepareVehicleDriver(actor) {
  const reference = getVehicleDriverReference(actor);
  if (!reference) return null;

  const resolved = await resolveActorReference(reference);
  return createActorReferencePresentation(reference, resolved, "ZUT.Vehicle.Driver.UnknownName");
}

export async function assignVehicleOwner(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (isVehicleActorDocument(candidateActor)) {
    return { status: "invalidType" };
  }

  await actor.update({
    "system.owner.actor": createActorReference(candidateActor)
  });

  return {
    status: "assigned",
    owner: candidateActor
  };
}

export async function assignVehicleDriver(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (isVehicleDriverDisallowedActor(candidateActor)) {
    return { status: "invalidType" };
  }

  if (hasVehicleDriver(actor, candidateActor)) {
    return { status: "alreadyDriver" };
  }

  if (getVehicleDriverReference(actor)) {
    return { status: "occupied" };
  }

  if (hasVehiclePassenger(actor, candidateActor)) {
    return { status: "alreadyPassenger" };
  }

  const capacity = getVehiclePassengerCapacity(actor);
  const occupancyCount = getVehicleOccupancyCount(actor);

  if (occupancyCount >= capacity) {
    return {
      status: "full",
      capacity,
      count: occupancyCount
    };
  }

  await actor.update({
    "system.driver.actor": createActorReference(candidateActor)
  });

  return {
    status: "assigned",
    driver: candidateActor,
    capacity,
    count: occupancyCount + 1
  };
}

export async function clearVehicleOwner(actor) {
  if (!actor || actor.documentName !== "Actor") return;

  await actor.update({
    "system.owner.actor": { ...EMPTY_ACTOR_REFERENCE }
  });
}

export async function clearVehicleDriver(actor) {
  if (!actor || actor.documentName !== "Actor") return;

  await actor.update({
    "system.driver.actor": { ...EMPTY_ACTOR_REFERENCE }
  });
}

export async function prepareVehiclePassengers(actor) {
  const passengers = getVehiclePassengersArray(actor);

  return Promise.all(
    passengers.map(async (passenger, index) => {
      const resolved = await resolveActorReference(passenger);

      return {
        index,
        ...createActorReferencePresentation(passenger, resolved, "ZUT.Vehicle.Passengers.UnknownName")
      };
    })
  );
}

export function hasVehiclePassenger(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const candidateReference = createActorReference(candidateActor);
  const passengers = getVehiclePassengersArray(actor);

  return passengers.some(passenger => isSameActorReference(passenger, candidateReference));
}

export function hasVehicleDriver(actor, candidateActor) {
  if (!candidateActor || candidateActor.documentName !== "Actor") return false;

  const driverReference = getVehicleDriverReference(actor);
  if (!driverReference) return false;

  return isSameActorReference(driverReference, createActorReference(candidateActor));
}

async function getEligibleGroupPassengerActors(vehicleActor, groupActor) {
  const currentPassengers = getVehiclePassengersArray(vehicleActor);
  const currentDriver = getVehicleDriverReference(vehicleActor);
  const groupMembers = getGroupMembersArray(groupActor);
  const eligibleActors = [];
  const selectedReferences = [];

  for (const memberReference of groupMembers) {
    const resolvedActor = await resolveActorReference(memberReference);
    if (!resolvedActor || resolvedActor.documentName !== "Actor") continue;
    if (isVehiclePassengerDisallowedActor(resolvedActor)) continue;

    const resolvedReference = createActorReference(resolvedActor);
    if (currentDriver && isSameActorReference(currentDriver, resolvedReference)) continue;
    if (hasActorReferenceInList(currentPassengers, resolvedReference)) continue;
    if (hasActorReferenceInList(selectedReferences, resolvedReference)) continue;

    eligibleActors.push(resolvedActor);
    selectedReferences.push(resolvedReference);
  }

  return eligibleActors;
}

async function addVehiclePassengerGroup(vehicleActor, groupActor) {
  const passengers = getVehiclePassengersArray(vehicleActor);
  const capacity = getVehiclePassengerCapacity(vehicleActor);
  const occupiedCount = getVehicleOccupancyCount(vehicleActor);
  const freeSeats = Math.max(0, capacity - occupiedCount);
  const eligibleActors = await getEligibleGroupPassengerActors(vehicleActor, groupActor);

  if (eligibleActors.length === 0) {
    return {
      status: "groupNoEligible",
      capacity,
      count: occupiedCount
    };
  }

  if (eligibleActors.length > freeSeats) {
    return {
      status: "groupFull",
      needed: eligibleActors.length,
      available: freeSeats,
      capacity,
      count: occupiedCount
    };
  }

  const nextPassengers = [
    ...passengers,
    ...eligibleActors.map(memberActor => createActorReference(memberActor))
  ];

  await vehicleActor.update({ "system.passengers": nextPassengers });

  return {
    status: "groupAdded",
    addedCount: eligibleActors.length,
    capacity,
    count: nextPassengers.length + (getVehicleDriverReference(vehicleActor) ? 1 : 0),
    group: groupActor
  };
}

export async function addVehiclePassenger(actor, candidateActor) {
  if (!actor || actor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (!candidateActor || candidateActor.documentName !== "Actor") {
    return { status: "invalid" };
  }

  if (isModuleGroupActorDocument(candidateActor)) {
    return addVehiclePassengerGroup(actor, candidateActor);
  }

  if (isVehiclePassengerDisallowedActor(candidateActor)) {
    return { status: "invalidType" };
  }

  if (hasVehicleDriver(actor, candidateActor)) {
    return { status: "driverDuplicate" };
  }

  if (hasVehiclePassenger(actor, candidateActor)) {
    return { status: "duplicate" };
  }

  const passengers = getVehiclePassengersArray(actor);
  const capacity = getVehiclePassengerCapacity(actor);
  const occupancyCount = getVehicleOccupancyCount(actor);

  if (occupancyCount >= capacity) {
    return {
      status: "full",
      capacity,
      count: occupancyCount
    };
  }

  passengers.push(createActorReference(candidateActor));

  await actor.update({ "system.passengers": passengers });

  return {
    status: "added",
    passenger: candidateActor,
    capacity,
    count: occupancyCount + 1
  };
}

export async function removeVehiclePassengerByIndex(actor, passengerIndex) {
  const passengers = getVehiclePassengersArray(actor);
  if (!Number.isInteger(passengerIndex)) return;
  if (passengerIndex < 0 || passengerIndex >= passengers.length) return;

  passengers.splice(passengerIndex, 1);
  await actor.update({ "system.passengers": passengers });
}

export async function cleanupVehicleRoleReferencesForDeletedActor(deletedActor) {
  if (!deletedActor || deletedActor.documentName !== "Actor") {
    return {
      status: "invalidDeletedActor",
      updatedVehicles: 0,
      clearedOwner: 0,
      clearedDriver: 0,
      removedPassengers: 0
    };
  }

  const deletedReference = createActorReference(deletedActor);
  let updatedVehicles = 0;
  let clearedOwner = 0;
  let clearedDriver = 0;
  let removedPassengers = 0;

  for (const actor of game.actors ?? []) {
    if (!isVehicleActorDocument(actor)) continue;
    if (actor.uuid === deletedActor.uuid) continue;

    const updateData = {};

    const ownerReference = getVehicleOwnerReference(actor);
    if (ownerReference && isSameActorReference(ownerReference, deletedReference)) {
      updateData["system.owner.actor"] = { ...EMPTY_ACTOR_REFERENCE };
      clearedOwner += 1;
    }

    const driverReference = getVehicleDriverReference(actor);
    if (driverReference && isSameActorReference(driverReference, deletedReference)) {
      updateData["system.driver.actor"] = { ...EMPTY_ACTOR_REFERENCE };
      clearedDriver += 1;
    }

    const passengers = getVehiclePassengersArray(actor);
    if (passengers.length) {
      const filteredPassengers = passengers.filter(
        passengerReference => !isSameActorReference(passengerReference, deletedReference)
      );

      if (filteredPassengers.length !== passengers.length) {
        updateData["system.passengers"] = filteredPassengers;
        removedPassengers += passengers.length - filteredPassengers.length;
      }
    }

    if (!Object.keys(updateData).length) continue;

    await actor.update(updateData);
    updatedVehicles += 1;
  }

  return {
    status: "cleaned",
    updatedVehicles,
    clearedOwner,
    clearedDriver,
    removedPassengers
  };
}
