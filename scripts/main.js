import {
  ACTOR_TYPES,
  LOCALIZATION_PREFIX,
  MODULE_ID,
  MODULE_TITLE,
  isModuleActorType,
  qualifyModuleActorType
} from "./core/constants.js";
import { logger } from "./core/logger.js";
import { registerFactionActorSheet } from "./apps/faction-actor-sheet.js";
import { registerGroupActorSheet } from "./apps/group-actor-sheet.js";
import { registerVehicleActorSheet } from "./apps/vehicle-actor-sheet.js";
import { openStorageWindow } from "./apps/storage-window.js";
import { registerActorDataModels } from "./model/register-models.js";
import {
  getStorageDragDataFromEvent,
  isStorageTransferDragData,
  moveStorageItemFromDragData
} from "./services/storage-transfer.service.js";
import {
  cleanupTwduLinksForDeletedVehicle,
  clearVehicleDriverForDeletedTwduClone,
  isTwduSystemActive,
  shouldIgnoreTwduVehicleItemHooks,
  syncModuleVehicleFromTwduLinkedItem,
  syncTwduDriverVehicleClone
} from "./services/twdu-vehicle-integration.service.js";
import {
  cleanupVehicleRoleReferencesForDeletedActor,
  isVehicleActorDocument
} from "./services/vehicle-actor.service.js";
import * as settingsApi from "./settings/access.js";
import { registerSettings } from "./settings/register.js";

const GROUP_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/group-actor.webp`;
const FACTION_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/faction-actor.webp`;
const VEHICLE_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/vehicle-actor.webp`;


async function openStorageViaApi(actorOrUuid, slotId) {
  const actor = typeof actorOrUuid === "string"
    ? await fromUuid(actorOrUuid)
    : actorOrUuid;

  if (actor?.documentName !== "Actor") {
    throw new Error("storage.open expected an Actor document or Actor UUID.");
  }

  return openStorageWindow(actor, slotId);
}

function buildApi() {
  return Object.freeze({
    constants: Object.freeze({
      MODULE_ID,
      MODULE_TITLE,
      ACTOR_TYPES
    }),
    settings: Object.freeze({
      get: settingsApi.getSetting,
      set: settingsApi.setSetting,
      has: settingsApi.hasSetting
    }),
    storage: Object.freeze({
      open: openStorageViaApi
    })
  });
}

function registerApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  module.api = buildApi();
}

function isDefaultActorImage(imagePath, actor) {
  if (!imagePath) return true;
  const defaultIcon = actor?.constructor?.DEFAULT_ICON ?? "icons/svg/mystery-man.svg";
  if (imagePath === defaultIcon) return true;
  // TWDU system auto-assigns `systems/twdu/assets/images/twdu-{type}.png` during create().
  // Treat these as "not user-set" so we can still apply our placeholder.
  if (/^systems\/twdu\/assets\/images\/twdu-.+\.(?:png|webp|svg)$/.test(imagePath)) return true;
  return false;
}

function applyActorPlaceholder(updateData, actor, placeholderPath) {
  const currentImage = foundry.utils.getProperty(actor._source, "img");
  const currentTokenImage = foundry.utils.getProperty(actor._source, "prototypeToken.texture.src");

  if (isDefaultActorImage(currentImage, actor)) {
    updateData.img = placeholderPath;
  }

  if (isDefaultActorImage(currentTokenImage, actor)) {
    updateData.prototypeToken.texture = {
      src: placeholderPath
    };
  }
}

function getDropTargetActorSheet(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return null;
  if (target.closest(".zut-storage-window")) return null;

  const appElement = target.closest("[data-appid]");
  const appId = Number(appElement?.dataset?.appid);
  if (!Number.isInteger(appId)) return null;

  const app = ui.windows?.[appId] ?? null;
  if (!app?.document || app.document.documentName !== "Actor") return null;

  return app;
}

function changedDataHasPath(changedData, path) {
  return foundry.utils.hasProperty(changedData, path)
    || Object.prototype.hasOwnProperty.call(changedData, path);
}

async function onGlobalStorageItemDrop(event) {
  if (event.defaultPrevented) return;

  const dragData = getStorageDragDataFromEvent(event);
  if (!isStorageTransferDragData(dragData)) return;

  const targetSheet = getDropTargetActorSheet(event);
  if (!targetSheet) return;

  event.preventDefault();
  event.stopPropagation();

  const result = await moveStorageItemFromDragData(dragData, targetSheet.document);

  switch (result.status) {
    case "movedWithinActor":
    case "movedToActor":
      ui.notifications?.info(game.i18n.localize("ZUT.Storage.Notifications.ItemMovedToActor"));
      break;

    case "locked":
      ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.StorageLocked"));
      break;

    case "targetNotOwned":
      ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.TargetActorNotOwned"));
      break;

    default:
      ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.MoveToActorFailed"));
      break;
  }
}

Hooks.on("preCreateActor", actor => {
  if (!isModuleActorType(actor.type)) return;

  const updateData = {
    prototypeToken: {
      actorLink: settingsApi.getDefaultLinkActorDataForActorType(actor.type),
      lockRotation: settingsApi.getDefaultLockArtworkRotationForActorType(actor.type)
    }
  };

  const isGroupActor = actor.type === qualifyModuleActorType(ACTOR_TYPES.GROUP);
  const isFactionActor = actor.type === qualifyModuleActorType(ACTOR_TYPES.FACTION);
  const isVehicleActor = actor.type === qualifyModuleActorType(ACTOR_TYPES.VEHICLE);

  if (isGroupActor) {
    applyActorPlaceholder(updateData, actor, GROUP_ACTOR_PLACEHOLDER);
  }

  if (isFactionActor) {
    applyActorPlaceholder(updateData, actor, FACTION_ACTOR_PLACEHOLDER);
  }

  if (isVehicleActor) {
    applyActorPlaceholder(updateData, actor, VEHICLE_ACTOR_PLACEHOLDER);
  }

  actor.updateSource(updateData);
});

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

  void syncTwduDriverVehicleClone(actor).catch(error => {
    logger.error("Failed to sync TWDU driver vehicle clone after actor update.", error);
  });
});

Hooks.on("updateItem", (item, changedData, options) => {
  if (!isTwduSystemActive()) return;
  if (shouldIgnoreTwduVehicleItemHooks(options)) return;

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
  if (shouldIgnoreTwduVehicleItemHooks(options)) return;

  logger.debug("TWDU linked driver clone deletion detected on deleteItem.", {
    itemUuid: item.uuid,
    itemName: item.name,
    parentActorUuid: item.parent?.uuid ?? ""
  });

  void clearVehicleDriverForDeletedTwduClone(item).catch(error => {
    logger.error("Failed to clear module vehicle driver after linked TWDU clone deletion.", error);
  });
});

Hooks.on("deleteActor", actor => {
  void cleanupVehicleRoleReferencesForDeletedActor(actor)
    .then(result => {
      if (result.status !== "cleaned") return;
      if (!result.updatedVehicles && !result.clearedOwner && !result.clearedDriver && !result.removedPassengers) return;

      logger.debug("Cleaned vehicle role references after actor deletion.", {
        deletedActorUuid: actor?.uuid ?? "",
        deletedActorName: actor?.name ?? "",
        result
      });
    })
    .catch(error => {
      logger.error("Failed to clean vehicle role references after actor deletion.", error);
    });

  if (!isTwduSystemActive()) return;
  if (!isVehicleActorDocument(actor)) return;

  void cleanupTwduLinksForDeletedVehicle(actor)
    .then(result => {
      if (result.status !== "cleaned") return;
      if (!result.removedClones) return;

      logger.debug("Cleaned TWDU linked driver vehicle clone items after vehicle deletion.", {
        deletedVehicleUuid: actor?.uuid ?? "",
        deletedVehicleName: actor?.name ?? "",
        result
      });
    })
    .catch(error => {
      logger.error("Failed to clean TWDU linked items after vehicle deletion.", error);
    });
});

Hooks.once("init", () => {
  registerActorDataModels();
  registerFactionActorSheet();
  registerGroupActorSheet();
  registerVehicleActorSheet();
  logger.info(game.i18n.localize(`${LOCALIZATION_PREFIX}.Log.Init`));
  registerSettings();
});

Hooks.once("setup", () => {
  registerApi();
  logger.debug("Module API registered.");
});

Hooks.once("ready", () => {
  document.addEventListener("drop", onGlobalStorageItemDrop, true);

  if (isTwduSystemActive()) {
    const vehicleActors = game.actors?.filter(
      actor => actor.type === ACTOR_TYPES.VEHICLE || actor.type === qualifyModuleActorType(ACTOR_TYPES.VEHICLE)
    ) ?? [];

    for (const vehicleActor of vehicleActors) {
      void syncTwduDriverVehicleClone(vehicleActor).catch(error => {
        logger.error("Failed to sync TWDU driver vehicle clone during ready hook.", error);
      });
    }
  }

  logger.info(game.i18n.localize(`${LOCALIZATION_PREFIX}.Log.Ready`));
});
