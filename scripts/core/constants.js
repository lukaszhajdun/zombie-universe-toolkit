export const MODULE_ID = "zombie-universe-toolkit";
export const MODULE_TITLE = "Zombie Universe Toolkit";
export const LOCALIZATION_PREFIX = "ZUT";

export const ACTOR_TYPES = Object.freeze({
  GROUP: "group",
  PARTY: "party",
  VEHICLE: "vehicle",
  FACTION: "faction"
});

export const MODULE_ACTOR_TYPES = Object.freeze(Object.values(ACTOR_TYPES));

export function qualifyModuleActorType(type) {
  return `${MODULE_ID}.${type}`;
}

export function isModuleActorType(type) {
  if (typeof type !== "string" || !type.length) return false;
  return MODULE_ACTOR_TYPES.some(moduleType => qualifyModuleActorType(moduleType) === type);
}

export function toModuleActorKey(actorType) {
  if (typeof actorType !== "string" || !actorType.length) return null;
  if (MODULE_ACTOR_TYPES.includes(actorType)) return actorType;

  const prefix = `${MODULE_ID}.`;
  if (actorType.startsWith(prefix)) {
    const normalizedType = actorType.slice(prefix.length);
    return MODULE_ACTOR_TYPES.includes(normalizedType) ? normalizedType : null;
  }

  return null;
}

export const SETTINGS_KEYS = Object.freeze({
  DEBUG: "debug",
  DEFAULT_LINK_ACTOR_DATA: "defaultLinkActorData",
  DEFAULT_LOCK_ARTWORK_ROTATION: "defaultLockArtworkRotation",
  GROUP_DEFAULT_LINK_ACTOR_DATA: "groupDefaultLinkActorData",
  GROUP_DEFAULT_LOCK_ARTWORK_ROTATION: "groupDefaultLockArtworkRotation",
  PARTY_DEFAULT_LINK_ACTOR_DATA: "partyDefaultLinkActorData",
  PARTY_DEFAULT_LOCK_ARTWORK_ROTATION: "partyDefaultLockArtworkRotation",
  VEHICLE_DEFAULT_LINK_ACTOR_DATA: "vehicleDefaultLinkActorData",
  VEHICLE_DEFAULT_LOCK_ARTWORK_ROTATION: "vehicleDefaultLockArtworkRotation",
  FACTION_DEFAULT_LINK_ACTOR_DATA: "factionDefaultLinkActorData",
  FACTION_DEFAULT_LOCK_ARTWORK_ROTATION: "factionDefaultLockArtworkRotation"
});

export const DEFAULT_SETTINGS = Object.freeze({
  [SETTINGS_KEYS.DEBUG]: false,
  [SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA]: true,
  [SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION]: true,
  [SETTINGS_KEYS.GROUP_DEFAULT_LINK_ACTOR_DATA]: true,
  [SETTINGS_KEYS.GROUP_DEFAULT_LOCK_ARTWORK_ROTATION]: true,
  [SETTINGS_KEYS.PARTY_DEFAULT_LINK_ACTOR_DATA]: true,
  [SETTINGS_KEYS.PARTY_DEFAULT_LOCK_ARTWORK_ROTATION]: true,
  [SETTINGS_KEYS.VEHICLE_DEFAULT_LINK_ACTOR_DATA]: true,
  [SETTINGS_KEYS.VEHICLE_DEFAULT_LOCK_ARTWORK_ROTATION]: true,
  [SETTINGS_KEYS.FACTION_DEFAULT_LINK_ACTOR_DATA]: true,
  [SETTINGS_KEYS.FACTION_DEFAULT_LOCK_ARTWORK_ROTATION]: true
});

export const ACTOR_TYPE_SETTINGS_KEYS = Object.freeze({
  [ACTOR_TYPES.GROUP]: Object.freeze({
    defaultLinkActorData: SETTINGS_KEYS.GROUP_DEFAULT_LINK_ACTOR_DATA,
    defaultLockArtworkRotation: SETTINGS_KEYS.GROUP_DEFAULT_LOCK_ARTWORK_ROTATION
  }),
  [ACTOR_TYPES.PARTY]: Object.freeze({
    defaultLinkActorData: SETTINGS_KEYS.PARTY_DEFAULT_LINK_ACTOR_DATA,
    defaultLockArtworkRotation: SETTINGS_KEYS.PARTY_DEFAULT_LOCK_ARTWORK_ROTATION
  }),
  [ACTOR_TYPES.VEHICLE]: Object.freeze({
    defaultLinkActorData: SETTINGS_KEYS.VEHICLE_DEFAULT_LINK_ACTOR_DATA,
    defaultLockArtworkRotation: SETTINGS_KEYS.VEHICLE_DEFAULT_LOCK_ARTWORK_ROTATION
  }),
  [ACTOR_TYPES.FACTION]: Object.freeze({
    defaultLinkActorData: SETTINGS_KEYS.FACTION_DEFAULT_LINK_ACTOR_DATA,
    defaultLockArtworkRotation: SETTINGS_KEYS.FACTION_DEFAULT_LOCK_ARTWORK_ROTATION
  })
});

export const FLAGS = Object.freeze({
  ACTOR_REF: `${MODULE_ID}.actorRef`,
  UI_STATE: `${MODULE_ID}.uiState`
});

export const ACTOR_FLAGS = Object.freeze({
  EDIT_LOCKED: "editLocked"
});

export const ITEM_FLAGS = Object.freeze({
  STORAGE_SLOT_ID: "storageSlotId"
});

export const STORAGE_TRANSFER_DATA_KEY = "zutStorageTransfer";

export const CSS_CLASSES = Object.freeze({
  ROOT: MODULE_ID
});
