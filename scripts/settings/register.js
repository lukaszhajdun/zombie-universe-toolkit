import {
  ACTOR_TYPES,
  DEFAULT_SETTINGS,
  LOCALIZATION_PREFIX,
  MODULE_ID,
  SETTINGS_KEYS
} from "../core/constants.js";

let settingsRegistered = false;

function registerBooleanWorldSetting(key, localizationBase) {
  game.settings.register(MODULE_ID, key, {
    name: `${LOCALIZATION_PREFIX}.Settings.${localizationBase}.Name`,
    hint: `${LOCALIZATION_PREFIX}.Settings.${localizationBase}.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: DEFAULT_SETTINGS[key]
  });
}

export function registerSettings() {
  if (settingsRegistered) return;

  game.settings.register(MODULE_ID, SETTINGS_KEYS.DEBUG, {
    name: `${LOCALIZATION_PREFIX}.Settings.Debug.Name`,
    hint: `${LOCALIZATION_PREFIX}.Settings.Debug.Hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULT_SETTINGS[SETTINGS_KEYS.DEBUG]
  });

  registerBooleanWorldSetting(
    SETTINGS_KEYS.DEFAULT_LINK_ACTOR_DATA,
    "DefaultLinkActorData"
  );
  registerBooleanWorldSetting(
    SETTINGS_KEYS.DEFAULT_LOCK_ARTWORK_ROTATION,
    "DefaultLockArtworkRotation"
  );

  registerBooleanWorldSetting(
    SETTINGS_KEYS.GROUP_DEFAULT_LINK_ACTOR_DATA,
    "ActorTypes.Group.DefaultLinkActorData"
  );
  registerBooleanWorldSetting(
    SETTINGS_KEYS.GROUP_DEFAULT_LOCK_ARTWORK_ROTATION,
    "ActorTypes.Group.DefaultLockArtworkRotation"
  );

  registerBooleanWorldSetting(
    SETTINGS_KEYS.PARTY_DEFAULT_LINK_ACTOR_DATA,
    "ActorTypes.Party.DefaultLinkActorData"
  );
  registerBooleanWorldSetting(
    SETTINGS_KEYS.PARTY_DEFAULT_LOCK_ARTWORK_ROTATION,
    "ActorTypes.Party.DefaultLockArtworkRotation"
  );

  registerBooleanWorldSetting(
    SETTINGS_KEYS.VEHICLE_DEFAULT_LINK_ACTOR_DATA,
    "ActorTypes.Vehicle.DefaultLinkActorData"
  );
  registerBooleanWorldSetting(
    SETTINGS_KEYS.VEHICLE_DEFAULT_LOCK_ARTWORK_ROTATION,
    "ActorTypes.Vehicle.DefaultLockArtworkRotation"
  );

  registerBooleanWorldSetting(
    SETTINGS_KEYS.FACTION_DEFAULT_LINK_ACTOR_DATA,
    "ActorTypes.Faction.DefaultLinkActorData"
  );
  registerBooleanWorldSetting(
    SETTINGS_KEYS.FACTION_DEFAULT_LOCK_ARTWORK_ROTATION,
    "ActorTypes.Faction.DefaultLockArtworkRotation"
  );

  settingsRegistered = true;
}
