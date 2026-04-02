import {
  ACTOR_TYPE_SETTINGS_KEYS,
  DEFAULT_SETTINGS,
  MODULE_ID,
  SETTINGS_KEYS,
  toModuleActorKey
} from "../core/constants.js";

export function hasSetting(key) {
  return game?.settings?.settings?.has(`${MODULE_ID}.${key}`) ?? false;
}

export function getSetting(key, fallback = null) {
  if (!hasSetting(key)) return fallback;

  try {
    return game.settings.get(MODULE_ID, key);
  } catch (error) {
    console.warn(`[${MODULE_ID}] Failed to read setting "${key}".`, error);
    return fallback;
  }
}

export async function setSetting(key, value) {
  if (!hasSetting(key)) {
    throw new Error(`[${MODULE_ID}] Unknown setting "${key}".`);
  }

  return game.settings.set(MODULE_ID, key, value);
}

function getBooleanSetting(key, fallbackKey) {
  return getSetting(key, DEFAULT_SETTINGS[fallbackKey]) === true;
}

function getActorTypeSettingsKeys(actorType) {
  const actorKey = toModuleActorKey(actorType);
  if (!actorKey) return null;
  return ACTOR_TYPE_SETTINGS_KEYS[actorKey] ?? null;
}

export function getDefaultLinkActorData() {
  return getBooleanSetting(
    SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA,
    SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA
  );
}

export function getDefaultLockArtworkRotation() {
  return getBooleanSetting(
    SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION,
    SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION
  );
}

export function getDefaultLinkActorDataForActorType(actorType) {
  const actorTypeSettings = getActorTypeSettingsKeys(actorType);
  if (!actorTypeSettings?.defaultLinkActorData) {
    return getDefaultLinkActorData();
  }

  return getBooleanSetting(
    actorTypeSettings.defaultLinkActorData,
    actorTypeSettings.defaultLinkActorData
  );
}

export function getDefaultLockArtworkRotationForActorType(actorType) {
  const actorTypeSettings = getActorTypeSettingsKeys(actorType);
  if (!actorTypeSettings?.defaultLockArtworkRotation) {
    return getDefaultLockArtworkRotation();
  }

  return getBooleanSetting(
    actorTypeSettings.defaultLockArtworkRotation,
    actorTypeSettings.defaultLockArtworkRotation
  );
}
