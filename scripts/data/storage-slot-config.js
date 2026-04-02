import { ACTOR_TYPES } from "../core/constants.js";

export const STORAGE_SLOT_IDS = Object.freeze({
  TRUNK: "trunk"
});

const STORAGE_SLOT_CONFIG = Object.freeze({
  [STORAGE_SLOT_IDS.TRUNK]: Object.freeze({
    id: STORAGE_SLOT_IDS.TRUNK,
    actorTypes: Object.freeze([ACTOR_TYPES.VEHICLE]),
    labelKey: "ZUT.Storage.Slots.Trunk.Label",
    sectionLabelKey: "ZUT.Storage.Slots.Trunk.SectionLabel",
    enabledPath: "system.storage.trunk.enabled",
    capacityPath: "system.storage.trunk.capacity"
  })
});

export function getStorageSlotConfig(slotId) {
  if (typeof slotId !== "string" || !slotId.length) return null;
  return STORAGE_SLOT_CONFIG[slotId] ?? null;
}

export function getActorStorageSlotConfig(actor, slotId) {
  const config = getStorageSlotConfig(slotId);
  if (!config || !actor) return null;

  const normalizedType = String(actor.type ?? "").split(".").pop() ?? "";
  if (Array.isArray(config.actorTypes) && config.actorTypes.length > 0 && !config.actorTypes.includes(normalizedType)) {
    return null;
  }

  return config;
}
