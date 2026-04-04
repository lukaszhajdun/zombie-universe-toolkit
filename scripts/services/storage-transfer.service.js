import {
  ITEM_FLAGS,
  MODULE_ID,
  STORAGE_TRANSFER_DATA_KEY
} from "../core/constants.js";
import {
  getDragDataFromEvent,
  resolveItemFromDragData
} from "./dragdrop.service.js";
import {
  getItemStorageSlot,
  getStorageSlotMetadata,
  isStorageHostLocked
} from "./storage.service.js";

function isActorDocument(actor) {
  return actor?.documentName === "Actor";
}

function isItemDocument(item) {
  return item?.documentName === "Item";
}

function sanitizeModuleFlags(flags = {}) {
  const nextFlags = foundry.utils.deepClone(flags);
  const moduleFlags = foundry.utils.deepClone(nextFlags[MODULE_ID] ?? {});

  delete moduleFlags[ITEM_FLAGS.STORAGE_SLOT_ID];

  if (Object.keys(moduleFlags).length > 0) {
    nextFlags[MODULE_ID] = moduleFlags;
  } else {
    delete nextFlags[MODULE_ID];
  }

  return nextFlags;
}

function buildItemCreateData(item, slotId = "") {
  const data = foundry.utils.deepClone(item.toObject());
  delete data._id;

  data.flags = sanitizeModuleFlags(data.flags ?? {});

  if (slotId) {
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${ITEM_FLAGS.STORAGE_SLOT_ID}`, slotId);
  }

  return data;
}

export function getStorageDragDataFromEvent(event) {
  return getDragDataFromEvent(event);
}

export function isStorageTransferDragData(dragData) {
  return Boolean(dragData?.[STORAGE_TRANSFER_DATA_KEY]);
}

function resolveLegacyDraggedItemDocument() {
  const legacyDraggedItem = game?.data?.item;
  if (!isItemDocument(legacyDraggedItem)) return null;
  return isActorDocument(legacyDraggedItem.parent) ? legacyDraggedItem : null;
}

export async function resolveDroppedItemDocument(dragData, event = null) {
  let canUseLegacyFallback = !dragData;

  if (dragData && typeof dragData === "object") {
    if (isStorageTransferDragData(dragData)) return null;

    // If explicit drag payload exists, trust it. Non-item payloads must be
    // rejected, and malformed item payloads should not fall back to globals.
    if (dragData.type && dragData.type !== "Item") return null;

    const resolvedItem = await resolveItemFromDragData(dragData);
    if (resolvedItem) return resolvedItem;

    // Some actor sheets provide an object payload without item typing.
    // Allow legacy fallback only for that missing-type case.
    canUseLegacyFallback = !dragData.type;
  }

  // TWDU actor sheets still track dragged owned items via `game.data.item`.
  // Only use that legacy path when the browser provides no payload at all.
  if (
    typeof DragEvent === "function"
    && event instanceof DragEvent
    && canUseLegacyFallback
  ) {
    return resolveLegacyDraggedItemDocument();
  }

  return null;
}

export function createStorageTransferDragData(item, slotId) {
  if (!isItemDocument(item)) {
    throw new Error("createStorageTransferDragData expected an Item document.");
  }

  return {
    type: "Item",
    uuid: item.uuid,
    [STORAGE_TRANSFER_DATA_KEY]: {
      sourceActorUuid: item.parent?.uuid ?? "",
      sourceItemId: item.id ?? "",
      sourceSlotId: slotId
    }
  };
}

async function moveExistingItemToStorageHost(hostActor, slotId, item) {
  if (!isItemDocument(item) || item.parent !== hostActor) {
    return { status: "invalid" };
  }

  if (getItemStorageSlot(item) === slotId) {
    return { status: "alreadyStored", item };
  }

  await item.update({
    [`flags.${MODULE_ID}.${ITEM_FLAGS.STORAGE_SLOT_ID}`]: slotId
  });

  return { status: "stored", item };
}

async function copyItemToStorageHost(hostActor, slotId, item) {
  const createData = buildItemCreateData(item, slotId);
  const [createdItem] = await hostActor.createEmbeddedDocuments("Item", [createData]);
  return createdItem ?? null;
}

export async function addItemToStorage(hostActor, slotId, item) {
  if (!isActorDocument(hostActor) || !isItemDocument(item)) {
    return { status: "invalid" };
  }

  if (isStorageHostLocked(hostActor)) {
    return { status: "locked" };
  }

  const meta = getStorageSlotMetadata(hostActor, slotId);
  if (!meta.enabled) {
    return { status: "disabled" };
  }

  if (item.parent === hostActor) {
    return moveExistingItemToStorageHost(hostActor, slotId, item);
  }

  const createdItem = await copyItemToStorageHost(hostActor, slotId, item);
  if (!createdItem) {
    return { status: "invalid" };
  }

  if (isActorDocument(item.parent)) {
    await item.delete();
    return { status: "moved", item: createdItem };
  }

  return { status: "copied", item: createdItem };
}

export async function moveStorageItemToActor(sourceActor, slotId, itemId, targetActor) {
  if (!isActorDocument(sourceActor) || !isActorDocument(targetActor)) {
    return { status: "invalid" };
  }

  if (isStorageHostLocked(sourceActor)) {
    return { status: "locked" };
  }

  if (!targetActor.isOwner) {
    return { status: "targetNotOwned" };
  }

  const item = sourceActor.items.get(itemId);
  if (!item || getItemStorageSlot(item) !== slotId) {
    return { status: "missing" };
  }

  if (targetActor === sourceActor) {
    await item.update({
      [`flags.${MODULE_ID}.${ITEM_FLAGS.STORAGE_SLOT_ID}`]: null
    });

    return { status: "movedWithinActor", item };
  }

  const createData = buildItemCreateData(item, "");
  const [createdItem] = await targetActor.createEmbeddedDocuments("Item", [createData]);
  await item.delete();

  return { status: "movedToActor", item: createdItem ?? null, targetActor };
}

export async function moveStorageItemFromDragData(dragData, targetActor) {
  const transferData = dragData?.[STORAGE_TRANSFER_DATA_KEY];
  if (!transferData || typeof transferData !== "object") {
    return { status: "invalid" };
  }

  const sourceActor = transferData.sourceActorUuid
    ? await fromUuid(transferData.sourceActorUuid)
    : null;

  if (!isActorDocument(sourceActor)) {
    return { status: "missingSource" };
  }

  return moveStorageItemToActor(
    sourceActor,
    transferData.sourceSlotId,
    transferData.sourceItemId,
    targetActor
  );
}
