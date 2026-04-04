import {
  ACTOR_TYPES,
  MODULE_ID,
  qualifyModuleActorType
} from "../core/constants.js";
import { logger } from "../core/logger.js";
import { resolveActorReference } from "./actor-ref.service.js";
import { getVehicleDriverReference } from "./vehicle-actor.service.js";

const SNAPSHOT_FLAG_KEY = "twduVehicleItemSnapshot";
const DRIVER_CLONE_FLAG_KEY = "twduVehicleClone";
const SOURCE_ITEM_FLAG_KEY = "twduVehicleSourceItem";

function isActorDocument(actor) {
  return actor?.documentName === "Actor";
}

function isModuleVehicleActor(actor) {
  if (!isActorDocument(actor)) return false;

  return actor.type === ACTOR_TYPES.VEHICLE
    || actor.type === qualifyModuleActorType(ACTOR_TYPES.VEHICLE);
}

function parseIntegerValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.max(0, Math.trunc(numericValue));
}

function buildVehicleStatsUpdateFromTwduItem(item) {
  const twduSystemData = item?.system ?? {};

  const durability = parseIntegerValue(twduSystemData.hull);
  const maneuverability = parseIntegerValue(twduSystemData.maneuverability ?? twduSystemData.manueverability);
  const damage = parseIntegerValue(twduSystemData.damage);
  const armor = parseIntegerValue(twduSystemData.armor);

  const updateData = {};
  if (durability !== null) updateData["system.stats.durability"] = durability;
  if (maneuverability !== null) updateData["system.stats.maneuverability"] = maneuverability;
  if (damage !== null) updateData["system.stats.damage"] = damage;
  if (armor !== null) updateData["system.stats.armor"] = armor;
  if (Object.prototype.hasOwnProperty.call(twduSystemData, "issue")) {
    updateData["system.summary.issues"] = String(twduSystemData.issue ?? "");
  }

  return updateData;
}

function createTwduVehicleItemSnapshot(item) {
  return {
    importedAt: new Date().toISOString(),
    source: {
      uuid: item?.uuid ?? "",
      id: item?.id ?? "",
      name: item?.name ?? "",
      type: item?.type ?? "",
      pack: item?.pack ?? ""
    },
    item: item?.toObject?.() ?? {}
  };
}

function getVehicleSnapshot(actor) {
  return actor?.getFlag(MODULE_ID, SNAPSHOT_FLAG_KEY) ?? null;
}

function getDriverCloneMetadata(item) {
  return item?.getFlag(MODULE_ID, DRIVER_CLONE_FLAG_KEY) ?? null;
}

function getSourceItemMetadata(item) {
  return item?.getFlag(MODULE_ID, SOURCE_ITEM_FLAG_KEY) ?? null;
}

function buildSynchronizedVehicleSystemData(vehicleActor, sourceItemSystemData) {
  const synchronizedSystemData = foundry.utils.deepClone(sourceItemSystemData ?? {});

  const durability = parseIntegerValue(vehicleActor?.system?.stats?.durability) ?? 0;
  const maneuverability = parseIntegerValue(vehicleActor?.system?.stats?.maneuverability) ?? 0;
  const damage = parseIntegerValue(vehicleActor?.system?.stats?.damage) ?? 0;
  const armor = parseIntegerValue(vehicleActor?.system?.stats?.armor) ?? 0;

  synchronizedSystemData.hull = durability;
  synchronizedSystemData.maneuverability = maneuverability;
  synchronizedSystemData.manueverability = maneuverability;
  synchronizedSystemData.damage = damage;
  synchronizedSystemData.armor = armor;
  synchronizedSystemData.issue = String(vehicleActor?.system?.summary?.issues ?? "");

  return synchronizedSystemData;
}

function createVehicleSourceItemData(vehicleActor, snapshot) {
  const sourceItemData = foundry.utils.deepClone(snapshot?.item ?? {});
  const sourceFlags = foundry.utils.deepClone(sourceItemData.flags ?? {});

  sourceFlags[MODULE_ID] ??= {};
  sourceFlags[MODULE_ID][SOURCE_ITEM_FLAG_KEY] = {
    vehicleActorUuid: vehicleActor.uuid,
    vehicleActorId: vehicleActor.id,
    sourceItemUuid: snapshot?.source?.uuid ?? "",
    sourceItemId: snapshot?.source?.id ?? ""
  };

  return {
    name: vehicleActor?.name ?? sourceItemData.name ?? snapshot?.source?.name ?? "",
    type: sourceItemData.type ?? "vehicle",
    img: vehicleActor?.img ?? sourceItemData.img ?? "",
    system: buildSynchronizedVehicleSystemData(vehicleActor, sourceItemData.system ?? {}),
    flags: sourceFlags
  };
}

function createDriverCloneItemData(vehicleActor, sourceItem) {
  const sourceItemData = sourceItem?.toObject?.() ?? {};
  const sourceFlags = foundry.utils.deepClone(sourceItemData.flags ?? {});

  sourceFlags[MODULE_ID] ??= {};
  delete sourceFlags[MODULE_ID][SOURCE_ITEM_FLAG_KEY];

  sourceFlags[MODULE_ID][DRIVER_CLONE_FLAG_KEY] = {
    vehicleActorUuid: vehicleActor.uuid,
    vehicleActorId: vehicleActor.id,
    sourceItemUuid: sourceItem?.uuid ?? "",
    sourceItemId: sourceItem?.id ?? ""
  };

  return {
    name: vehicleActor?.name ?? sourceItemData.name ?? "",
    type: sourceItemData.type ?? "vehicle",
    img: vehicleActor?.img ?? sourceItemData.img ?? "",
    system: foundry.utils.deepClone(sourceItemData.system ?? {}),
    flags: sourceFlags
  };
}

function getVehicleSourceItems(vehicleActor) {
  if (!isActorDocument(vehicleActor)) return [];

  return vehicleActor.items.filter(
    item => getSourceItemMetadata(item)?.vehicleActorUuid === vehicleActor.uuid
  );
}

async function removeVehicleSourceItems(vehicleActor) {
  if (!isActorDocument(vehicleActor)) return 0;

  const sourceItemIds = getVehicleSourceItems(vehicleActor)
    .map(item => item.id)
    .filter(Boolean);

  if (!sourceItemIds.length) return 0;

  await vehicleActor.deleteEmbeddedDocuments("Item", sourceItemIds);
  return sourceItemIds.length;
}

async function upsertVehicleSourceItem(vehicleActor, snapshot) {
  if (!isActorDocument(vehicleActor)) return { status: "missingVehicleActor", sourceItem: null };

  const sourceItems = getVehicleSourceItems(vehicleActor);
  const sourceItemData = createVehicleSourceItemData(vehicleActor, snapshot);

  if (!sourceItems.length) {
    const [createdItem] = await vehicleActor.createEmbeddedDocuments("Item", [sourceItemData]);
    return {
      status: "created",
      sourceItem: createdItem ?? null
    };
  }

  const [primarySourceItem, ...duplicateSourceItems] = sourceItems;

  await vehicleActor.updateEmbeddedDocuments("Item", [
    {
      _id: primarySourceItem.id,
      ...sourceItemData
    }
  ]);

  if (duplicateSourceItems.length) {
    await vehicleActor.deleteEmbeddedDocuments(
      "Item",
      duplicateSourceItems.map(item => item.id).filter(Boolean)
    );
  }

  return {
    status: "updated",
    sourceItem: vehicleActor.items.get(primarySourceItem.id) ?? null
  };
}

async function removeDriverCloneItemsForVehicle(actor, vehicleActorUuid) {
  if (!isActorDocument(actor)) return 0;

  const cloneItemIds = actor.items
    .filter(item => getDriverCloneMetadata(item)?.vehicleActorUuid === vehicleActorUuid)
    .map(item => item.id)
    .filter(Boolean);

  if (!cloneItemIds.length) return 0;

  await actor.deleteEmbeddedDocuments("Item", cloneItemIds);
  return cloneItemIds.length;
}

async function upsertDriverVehicleClone(driverActor, vehicleActor, sourceItem) {
  if (!isActorDocument(driverActor)) return { status: "missingDriver" };
  if (!sourceItem) return { status: "missingSourceItem" };

  const cloneItems = driverActor.items.filter(
    item => getDriverCloneMetadata(item)?.vehicleActorUuid === vehicleActor.uuid
  );

  const cloneItemData = createDriverCloneItemData(vehicleActor, sourceItem);

  if (!cloneItems.length) {
    await driverActor.createEmbeddedDocuments("Item", [cloneItemData]);
    return { status: "created" };
  }

  const [primaryClone, ...duplicateClones] = cloneItems;

  await driverActor.updateEmbeddedDocuments("Item", [
    {
      _id: primaryClone.id,
      ...cloneItemData
    }
  ]);

  if (duplicateClones.length) {
    await driverActor.deleteEmbeddedDocuments(
      "Item",
      duplicateClones.map(item => item.id).filter(Boolean)
    );
  }

  return { status: "updated" };
}

function getCurrentDriverUuid(vehicleActor) {
  const reference = getVehicleDriverReference(vehicleActor);
  return typeof reference?.uuid === "string" && reference.uuid.length
    ? reference.uuid
    : "";
}

export function isTwduSystemActive() {
  return game.system?.id === "twdu";
}

export function isTwduVehicleItem(item) {
  return item?.documentName === "Item" && item.type === "vehicle";
}

export function getTwduVehicleItemSnapshot(actor) {
  return getVehicleSnapshot(actor);
}

export async function importTwduVehicleItemToModuleVehicle(vehicleActor, item) {
  if (!isModuleVehicleActor(vehicleActor)) {
    return { status: "invalidVehicleActor" };
  }

  if (!isTwduVehicleItem(item)) {
    return { status: "invalidVehicleItem" };
  }

  const snapshot = createTwduVehicleItemSnapshot(item);

  const updateData = {
    "system.details.vehicleType": item.name ?? ""
  };

  foundry.utils.mergeObject(updateData, buildVehicleStatsUpdateFromTwduItem(item), { inplace: true });

  await vehicleActor.setFlag(MODULE_ID, SNAPSHOT_FLAG_KEY, snapshot);
  await vehicleActor.update(updateData);

  const syncResult = await syncTwduDriverVehicleClone(vehicleActor);

  logger.debug("Imported TWDU vehicle item into module vehicle actor.", {
    vehicleActorUuid: vehicleActor.uuid,
    vehicleActorName: vehicleActor.name,
    importedItemUuid: item.uuid,
    importedItemName: item.name,
    appliedUpdateData: updateData,
    syncResult
  });

  return {
    status: "imported",
    item,
    snapshot,
    syncResult
  };
}

export async function syncTwduDriverVehicleClone(vehicleActor) {
  if (!isModuleVehicleActor(vehicleActor)) {
    return { status: "invalidVehicleActor" };
  }

  const snapshot = getVehicleSnapshot(vehicleActor);
  const isTwduActive = isTwduSystemActive();

  const sourceItemResult = snapshot
    ? await upsertVehicleSourceItem(vehicleActor, snapshot)
    : { status: "removed", sourceItem: null, removedSourceItems: await removeVehicleSourceItems(vehicleActor) };

  const currentDriverUuid = getCurrentDriverUuid(vehicleActor);
  const currentDriverReference = getVehicleDriverReference(vehicleActor);
  const currentDriver = currentDriverReference
    ? await resolveActorReference(currentDriverReference)
    : null;

  let removedClones = 0;

  for (const actor of game.actors ?? []) {
    const isCurrentDriver = currentDriverUuid.length > 0 && actor.uuid === currentDriverUuid;

    if (isCurrentDriver && snapshot && isTwduActive) continue;

    try {
      removedClones += await removeDriverCloneItemsForVehicle(actor, vehicleActor.uuid);
    } catch (_error) {
      // Ignore per-actor cleanup errors to avoid blocking the main actor flow.
    }
  }

  if (!snapshot || !isActorDocument(currentDriver) || !isTwduActive) {
    const result = {
      status: "cleaned",
      hasSnapshot: Boolean(snapshot),
      hasDriver: isActorDocument(currentDriver),
      removedClones,
      sourceItemStatus: sourceItemResult.status,
      sourceItemPresent: Boolean(sourceItemResult.sourceItem),
      twduActive: isTwduActive
    };

    logger.debug("TWDU vehicle clone sync cleanup pass completed.", {
      vehicleActorUuid: vehicleActor.uuid,
      vehicleActorName: vehicleActor.name,
      driverUuid: currentDriverUuid,
      result
    });

    return result;
  }

  const upsertResult = await upsertDriverVehicleClone(currentDriver, vehicleActor, sourceItemResult.sourceItem);

  const result = {
    status: "synced",
    hasSnapshot: true,
    hasDriver: true,
    removedClones,
    upsertStatus: upsertResult.status,
    sourceItemStatus: sourceItemResult.status,
    sourceItemPresent: Boolean(sourceItemResult.sourceItem),
    twduActive: isTwduActive
  };

  logger.debug("TWDU vehicle clone sync completed.", {
    vehicleActorUuid: vehicleActor.uuid,
    vehicleActorName: vehicleActor.name,
    driverUuid: currentDriverUuid,
    driverName: currentDriver?.name ?? "",
    result
  });

  return result;
}