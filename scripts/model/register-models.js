import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import { logger } from "../core/logger.js";
import { FactionActorData } from "./faction-actor-data.js";
import { GroupActorData } from "./group-actor-data.js";
import { PartyActorData } from "./party-actor-data.js";
import { VehicleActorData } from "./vehicle-actor-data.js";

let modelsRegistered = false;

function qualifiedActorType(type) {
  return `${MODULE_ID}.${type}`;
}

export function registerActorDataModels() {
  if (modelsRegistered) return;

  CONFIG.Actor.dataModels ??= {};

  Object.assign(CONFIG.Actor.dataModels, {
    [qualifiedActorType(ACTOR_TYPES.GROUP)]: GroupActorData,
    [qualifiedActorType(ACTOR_TYPES.PARTY)]: PartyActorData,
    [qualifiedActorType(ACTOR_TYPES.VEHICLE)]: VehicleActorData,
    [qualifiedActorType(ACTOR_TYPES.FACTION)]: FactionActorData
  });

  modelsRegistered = true;
  logger.debug("Actor data models registered.", {
    group: qualifiedActorType(ACTOR_TYPES.GROUP),
    party: qualifiedActorType(ACTOR_TYPES.PARTY),
    vehicle: qualifiedActorType(ACTOR_TYPES.VEHICLE),
    faction: qualifiedActorType(ACTOR_TYPES.FACTION)
  });
}

export function getQualifiedActorType(type) {
  return qualifiedActorType(type);
}
