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
import { registerPartyActorSheet } from "./apps/party-actor-sheet.js";
import { registerVehicleActorSheet } from "./apps/vehicle-actor-sheet.js";
import { openStorageWindow } from "./apps/storage-window.js";
import { registerActorDataModels } from "./model/register-models.js";
import {
  getStorageDragDataFromEvent,
  isStorageTransferDragData,
  moveStorageItemFromDragData
} from "./services/storage-transfer.service.js";
import {
  buildTwduVehicleCloneHolderIndex,
  isTwduGmAuthority,
  isTwduSystemActive,
  registerTwduGmAuthoritySocket,
  requestTwduDriverVehicleCloneSync
} from "./services/twdu-vehicle-integration.service.js";
import { canViewStorage } from "./services/storage.service.js";
import { registerVehicleSyncHooks } from "./hooks/vehicle-sync.hooks.js";
import { registerVehicleCleanupHooks } from "./hooks/vehicle-cleanup.hooks.js";
import * as settingsApi from "./settings/access.js";
import { registerSettings } from "./settings/register.js";

const GROUP_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/group-actor.webp`;
const PARTY_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/group-actor.webp`;
const FACTION_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/faction-actor.webp`;
const VEHICLE_ACTOR_PLACEHOLDER = `modules/${MODULE_ID}/assets/placeholders/vehicle-actor.webp`;


async function openStorageViaApi(actorOrUuid, slotId) {
  const actor = typeof actorOrUuid === "string"
    ? await fromUuid(actorOrUuid)
    : actorOrUuid;

  if (actor?.documentName !== "Actor") {
    throw new Error("storage.open expected an Actor document or Actor UUID.");
  }

  if (!canViewStorage(actor)) {
    throw new Error("storage.open requires ownership of the target actor.");
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
  const isPartyActor = actor.type === qualifyModuleActorType(ACTOR_TYPES.PARTY);
  const isFactionActor = actor.type === qualifyModuleActorType(ACTOR_TYPES.FACTION);
  const isVehicleActor = actor.type === qualifyModuleActorType(ACTOR_TYPES.VEHICLE);

  if (isGroupActor) {
    applyActorPlaceholder(updateData, actor, GROUP_ACTOR_PLACEHOLDER);
  }

  if (isPartyActor) {
    applyActorPlaceholder(updateData, actor, PARTY_ACTOR_PLACEHOLDER);
  }

  if (isFactionActor) {
    applyActorPlaceholder(updateData, actor, FACTION_ACTOR_PLACEHOLDER);
  }

  if (isVehicleActor) {
    applyActorPlaceholder(updateData, actor, VEHICLE_ACTOR_PLACEHOLDER);
  }

  actor.updateSource(updateData);
});

registerVehicleSyncHooks();
registerVehicleCleanupHooks();

Hooks.once("init", () => {
  registerActorDataModels();
  registerFactionActorSheet();
  registerGroupActorSheet();
  registerPartyActorSheet();
  registerVehicleActorSheet();
  logger.info(game.i18n.localize(`${LOCALIZATION_PREFIX}.Log.Init`));
  registerSettings();
});

Hooks.once("setup", () => {
  registerApi();
  registerTwduGmAuthoritySocket();
  logger.debug("Module API registered.");
});

Hooks.once("ready", () => {
  registerTwduGmAuthoritySocket();
  document.addEventListener("drop", onGlobalStorageItemDrop, true);

  if (isTwduSystemActive() && isTwduGmAuthority()) {
    const vehicleActors = game.actors?.filter(
      actor => actor.type === ACTOR_TYPES.VEHICLE || actor.type === qualifyModuleActorType(ACTOR_TYPES.VEHICLE)
    ) ?? [];
    const cloneHolderIndex = buildTwduVehicleCloneHolderIndex();

    for (const vehicleActor of vehicleActors) {
      void requestTwduDriverVehicleCloneSync(vehicleActor, {
        cloneHolderIndex
      }).catch(error => {
        logger.error("Failed to sync TWDU driver vehicle clone during ready hook.", error);
      });
    }
  }

  logger.info(game.i18n.localize(`${LOCALIZATION_PREFIX}.Log.Ready`));
});
