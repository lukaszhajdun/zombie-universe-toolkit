import {
  ACTOR_FLAGS,
  ITEM_FLAGS,
  MODULE_ID
} from "../core/constants.js";
import { getActorStorageSlotConfig } from "../data/storage-slot-config.js";

function isActorDocument(actor) {
  return actor?.documentName === "Actor";
}

function isItemDocument(item) {
  return item?.documentName === "Item";
}

function getSlotConfigOrThrow(actor, slotId) {
  const config = getActorStorageSlotConfig(actor, slotId);
  if (!config) {
    throw new Error(`Unsupported storage slot "${slotId}" for actor ${actor?.uuid ?? "unknown"}.`);
  }

  return config;
}

function readStorageProperty(actor, path, fallback) {
  const value = foundry.utils.getProperty(actor, path);
  return typeof value === "undefined" ? fallback : value;
}

export function isStorageHostLocked(actor) {
  if (!isActorDocument(actor)) return false;
  return actor.getFlag(MODULE_ID, ACTOR_FLAGS.EDIT_LOCKED) === true;
}

export function getStorageSlotMetadata(actor, slotId) {
  const config = getSlotConfigOrThrow(actor, slotId);
  const enabled = readStorageProperty(actor, config.enabledPath, true) === true;
  const capacity = readStorageProperty(actor, config.capacityPath, "") ?? "";
  const isLocked = isStorageHostLocked(actor);
  const canEdit = actor.isOwner && !isLocked;
  const canModifyItems = actor.isOwner && enabled && !isLocked;

  return {
    slotId,
    label: game.i18n.localize(config.labelKey),
    sectionLabel: game.i18n.localize(config.sectionLabelKey),
    enabled,
    capacity: String(capacity ?? ""),
    capacityDisplay: String(capacity ?? "").trim(),
    isLocked,
    canEdit,
    canModifyItems,
    hostName: actor.name ?? game.i18n.localize("ZUT.Sheets.Common.Unnamed")
  };
}

export async function updateStorageSlotCapacity(actor, slotId, capacity) {
  if (!isActorDocument(actor)) {
    return { status: "invalid" };
  }

  if (!actor.isOwner) {
    return { status: "forbidden" };
  }

  if (isStorageHostLocked(actor)) {
    return { status: "locked" };
  }

  const config = getSlotConfigOrThrow(actor, slotId);
  const nextCapacity = String(capacity ?? "");

  await actor.update({
    [config.capacityPath]: nextCapacity
  });

  return {
    status: "updated",
    capacity: nextCapacity
  };
}

export function getItemStorageSlot(item) {
  if (!isItemDocument(item)) return "";

  const slotId = item.getFlag(MODULE_ID, ITEM_FLAGS.STORAGE_SLOT_ID);
  return typeof slotId === "string" ? slotId : "";
}

export function isItemAssignedToStorageSlot(item, slotId) {
  return getItemStorageSlot(item) === slotId;
}

export function getStorageItems(actor, slotId) {
  if (!isActorDocument(actor)) return [];
  return actor.items.filter(item => getItemStorageSlot(item) === slotId);
}

export function prepareStorageItems(actor, slotId) {
  const storage = getStorageSlotMetadata(actor, slotId);

  return getStorageItems(actor, slotId).map(item => ({
    id: item.id,
    uuid: item.uuid,
    name: item.name ?? game.i18n.localize("ZUT.Storage.Items.Unnamed"),
    img: item.img || "icons/svg/item-bag.svg",
    type: item.type ?? "",
    hasSheet: Boolean(item.sheet),
    canModify: storage.canModifyItems
  }));
}

export function prepareStorageWindowContext(actor, slotId) {
  const storage = getStorageSlotMetadata(actor, slotId);
  const items = prepareStorageItems(actor, slotId);

  return {
    actor,
    slotId,
    storage: {
      ...storage,
      hasCapacity: storage.capacityDisplay.length > 0,
      hasItems: items.length > 0,
      itemsCount: items.length,
      emptyLabel: game.i18n.localize("ZUT.Storage.Empty.Items")
    },
    items
  };
}

export async function openStorageItemSheet(actor, itemId) {
  if (!isActorDocument(actor) || typeof itemId !== "string" || !itemId.length) return null;

  const item = actor.items.get(itemId);
  if (!item?.sheet) return null;

  item.sheet.render(true, { focus: true });
  return item;
}

export async function removeStorageItem(actor, slotId, itemId) {
  if (!isActorDocument(actor) || typeof itemId !== "string" || !itemId.length) {
    return { status: "invalid" };
  }

  if (isStorageHostLocked(actor)) {
    return { status: "locked" };
  }

  const item = actor.items.get(itemId);
  if (!item || getItemStorageSlot(item) !== slotId) {
    return { status: "missing" };
  }

  await actor.deleteEmbeddedDocuments("Item", [item.id]);
  return { status: "removed", item };
}
