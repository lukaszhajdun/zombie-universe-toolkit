import {
  MODULE_ID,
  SETTINGS_KEYS
} from "./constants.js";
import { getSetting } from "../settings/access.js";

function prefix() {
  return [`[${MODULE_ID}]`];
}

function isDebugEnabled() {
  return getSetting(SETTINGS_KEYS.DEBUG, false) === true;
}

export const logger = Object.freeze({
  debug(...args) {
    if (!isDebugEnabled()) return;
    console.debug(...prefix(), ...args);
  },

  info(...args) {
    console.info(...prefix(), ...args);
  },

  warn(...args) {
    console.warn(...prefix(), ...args);
  },

  error(...args) {
    console.error(...prefix(), ...args);
  }
});
