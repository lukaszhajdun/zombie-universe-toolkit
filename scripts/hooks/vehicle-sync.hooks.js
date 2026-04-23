import {
  ACTOR_TYPES,
  MODULE_ID,
  qualifyModuleActorType
} from "../core/constants.js";
import { logger } from "../core/logger.js";
import {
  clearVehicleDriverForDeletedTwduClone,
  isTwduSystemActive,
  requestTwduDriverVehicleCloneSync,
  shouldIgnoreTwduVehicleItemHooks,
  syncModuleVehicleFromTwduLinkedItem
} from "../services/twdu-vehicle-integration.service.js";

function changedDataHasPath(changedData, path) {
  return foundry.utils.hasProperty(changedData, path)
    || Object.prototype.hasOwnProperty.call(changedData, path);
}

export function registerVehicleSyncHooks() {
  Hooks.on("updateActor", (actor, changedData) => {
    if (!isTwduSystemActive()) return;

    const isVehicleActor = actor.type === ACTOR_TYPES.VEHICLE
      || actor.type === qualifyModuleActorType(ACTOR_TYPES.VEHICLE);

    if (!isVehicleActor) return;

    const driverChanged = changedDataHasPath(changedData, "system.driver.actor");
    const importedItemChanged = changedDataHasPath(changedData, `flags.${MODULE_ID}.twduVehicleItemSnapshot`);
    const statsChanged = changedDataHasPath(changedData, "system.stats")
      || changedDataHasPath(changedData, "system.stats.durability")
      || changedDataHasPath(changedData, "system.stats.maneuverability")
      || changedDataHasPath(changedData, "system.stats.damage")
      || changedDataHasPath(changedData, "system.stats.armor");
    const identityChanged = changedDataHasPath(changedData, "name")
      || changedDataHasPath(changedData, "img");
    const issuesChanged = changedDataHasPath(changedData, "system.summary")
      || changedDataHasPath(changedData, "system.summary.issues");

    if (!driverChanged && !importedItemChanged && !statsChanged && !identityChanged && !issuesChanged) return;

    logger.debug("TWDU vehicle sync trigger detected on updateActor.", {
      actorUuid: actor.uuid,
      actorName: actor.name,
      driverChanged,
      importedItemChanged,
      statsChanged,
      identityChanged,
      issuesChanged
    });

    void requestTwduDriverVehicleCloneSync(actor).catch(error => {
      logger.error("Failed to sync TWDU driver vehicle clone after actor update.", error);
    });
  });

  Hooks.on("updateItem", (item, changedData, options) => {
    if (!isTwduSystemActive()) return;
    if (shouldIgnoreTwduVehicleItemHooks(item, options)) return;

    const relevantVehicleFieldChanged = changedDataHasPath(changedData, "system")
      || changedDataHasPath(changedData, "name")
      || changedDataHasPath(changedData, "img")
      || changedDataHasPath(changedData, "system.hull")
      || changedDataHasPath(changedData, "system.maneuverability")
      || changedDataHasPath(changedData, "system.manueverability")
      || changedDataHasPath(changedData, "system.damage")
      || changedDataHasPath(changedData, "system.armor")
      || changedDataHasPath(changedData, "system.issue");

    if (!relevantVehicleFieldChanged) return;

    logger.debug("TWDU linked vehicle item reverse sync trigger detected on updateItem.", {
      itemUuid: item.uuid,
      itemName: item.name,
      parentActorUuid: item.parent?.uuid ?? ""
    });

    void syncModuleVehicleFromTwduLinkedItem(item).catch(error => {
      logger.error("Failed to sync module vehicle actor from linked TWDU vehicle item update.", error);
    });
  });

  Hooks.on("deleteItem", (item, options) => {
    if (!isTwduSystemActive()) return;
    if (shouldIgnoreTwduVehicleItemHooks(item, options)) return;

    logger.debug("TWDU linked driver clone deletion detected on deleteItem.", {
      itemUuid: item.uuid,
      itemName: item.name,
      parentActorUuid: item.parent?.uuid ?? ""
    });

    void clearVehicleDriverForDeletedTwduClone(item).catch(error => {
      logger.error("Failed to clear module vehicle driver after linked TWDU clone deletion.", error);
    });
  });
}
