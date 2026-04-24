import { MODULE_ID } from "../core/constants.js";
import { logger } from "../core/logger.js";

const SOCKET_NAME = `module.${MODULE_ID}`;

const actionHandlers = new Map();
let socketRegistered = false;

function getActiveGmUsers() {
  const users = Array.isArray(game.users?.contents)
    ? game.users.contents
    : typeof game.users?.filter === "function"
      ? game.users.filter(() => true)
      : Array.from(game.users ?? []);

  return users
    .filter(user => user?.active === true && user?.isGM === true)
    .sort((left, right) => String(left.id ?? "").localeCompare(String(right.id ?? "")));
}

export function getGmAuthorityUser() {
  return getActiveGmUsers()[0] ?? null;
}

export function isGmAuthority() {
  if (game.user?.isGM !== true) return false;
  return getGmAuthorityUser()?.id === game.user.id;
}

function hasActiveGmAuthority() {
  return Boolean(getGmAuthorityUser());
}

function emitGmAuthorityRequest(action, payload = {}) {
  if (!hasActiveGmAuthority()) {
    logger.debug("GM authority request skipped because no active GM is available.", {
      action,
      payload
    });
    return { status: "missingGmAuthority" };
  }

  if (!game.socket) {
    logger.debug("GM authority request skipped because game.socket is unavailable.", {
      action,
      payload
    });
    return { status: "missingSocket" };
  }

  game.socket.emit(SOCKET_NAME, {
    action,
    payload,
    senderUserId: game.user?.id ?? ""
  });

  logger.debug("GM authority request queued.", {
    action,
    payload
  });

  return { status: "queuedForGmAuthority" };
}

export async function runAsGmAuthority(action, payload, operation) {
  if (isGmAuthority()) {
    return operation();
  }

  return emitGmAuthorityRequest(action, payload);
}

async function handleGmAuthorityRequest(message = {}, socketSenderUserId = "") {
  if (!isGmAuthority()) return null;

  const action = String(message.action ?? "");
  const payload = message.payload && typeof message.payload === "object" ? message.payload : {};
  const senderUserId = String(socketSenderUserId || message.senderUserId || "");
  const normalizedMessage = {
    ...message,
    senderUserId
  };
  const handler = actionHandlers.get(action);

  logger.debug("GM authority request received.", {
    action,
    payload,
    senderUserId
  });

  if (typeof handler !== "function") {
    return { status: "unknownGmAuthorityAction", action };
  }

  try {
    return await handler(payload, normalizedMessage);
  } catch (error) {
    logger.error("Failed to handle GM authority request.", { action, payload, error });
    return { status: "failed", action };
  }
}

export function registerGmAuthoritySocket(handlers = {}) {
  for (const [action, handler] of Object.entries(handlers)) {
    if (typeof handler === "function") {
      actionHandlers.set(action, handler);
    }
  }

  if (socketRegistered) return;
  if (!game.socket) return;

  game.socket.on(SOCKET_NAME, (message, senderUserId) => {
    void handleGmAuthorityRequest(message, senderUserId);
  });

  socketRegistered = true;
}
