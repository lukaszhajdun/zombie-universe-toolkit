import {
  DRAG_DATA_TYPES,
  getDragDataFromEvent
} from "./dragdrop.service.js";

export const ACTOR_ROLE_TRANSFER_DATA_KEY = "zutActorRoleTransfer";
export const ACTOR_ROLE_TRANSFER_TYPE = "ZUT.ActorRoleTransfer";

export const ACTOR_ROLE_TRANSFER_SOURCE_TYPES = Object.freeze({
  SLOT: "slot",
  LIST_ITEM: "listItem"
});

export const ACTOR_ROLE_TRANSFER_TARGET_TYPES = Object.freeze({
  SLOT: "slot",
  LIST: "list",
  LIST_ITEM: "listItem"
});

function normalizeOptionalInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function getRoleTransferSourceElement(element) {
  return element instanceof Element
    ? element.closest("[data-role-transfer-source]")
    : null;
}

function getRoleTransferTargetElement(element) {
  return element instanceof Element
    ? element.closest("[data-role-transfer-target]")
    : null;
}

function getEventPathClosestElement(event, selector) {
  const path = typeof event?.composedPath === "function"
    ? event.composedPath()
    : [];

  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (node.matches(selector)) return node;
  }

  const target = event?.target;
  return target instanceof Element ? target.closest(selector) : null;
}

function getActorUuidFromSourceElement(element) {
  if (!(element instanceof Element)) return "";

  const uuid = String(element.dataset.uuid ?? "");
  if (uuid.length) {
    const parsed = foundry.utils.parseUuid(uuid);
    if (parsed?.documentType === "Actor") return uuid;

    // Accept common Actor UUID forms used by world and compendium documents.
    if (/^Actor\.[^.]+$/.test(uuid) || /\.Actor\.[^.]+$/.test(uuid)) {
      return uuid;
    }
  }

  const fallbackId = String(element.dataset.actorId ?? element.dataset.id ?? "");
  if (!fallbackId.length) return "";

  const fallbackActor = game.actors?.get(fallbackId);
  return fallbackActor?.uuid ?? "";
}

function parseRoleTransferLocation(element, datasetPrefix) {
  if (!(element instanceof Element)) return null;

  const role = String(element.dataset[`${datasetPrefix}Role`] ?? "");
  const type = String(element.dataset[`${datasetPrefix}Type`] ?? "");

  if (!role.length || !type.length) return null;

  return {
    [`${datasetPrefix}Role`]: role,
    [`${datasetPrefix}Type`]: type,
    [`${datasetPrefix}Index`]: normalizeOptionalInteger(element.dataset[`${datasetPrefix}Index`])
  };
}

export function createActorRoleTransferDragData({
  actorUuid = "",
  hostActorUuid = "",
  hostActorId = "",
  sourceType,
  sourceRole,
  sourceIndex = null
} = {}) {
  const normalizedActorUuid = String(actorUuid ?? "");
  const normalizedHostActorUuid = String(hostActorUuid ?? "");
  const normalizedHostActorId = String(hostActorId ?? "");

  if (!normalizedActorUuid.length) {
    throw new Error("createActorRoleTransferDragData expected an actorUuid.");
  }

  if (typeof sourceType !== "string" || !sourceType.length) {
    throw new Error("createActorRoleTransferDragData expected a sourceType.");
  }

  if (typeof sourceRole !== "string" || !sourceRole.length) {
    throw new Error("createActorRoleTransferDragData expected a sourceRole.");
  }

  return {
    type: ACTOR_ROLE_TRANSFER_TYPE,
    uuid: normalizedActorUuid,
    [ACTOR_ROLE_TRANSFER_DATA_KEY]: {
      actorUuid: normalizedActorUuid,
      hostActorUuid: normalizedHostActorUuid,
      hostActorId: normalizedHostActorId,
      sourceType,
      sourceRole,
      sourceIndex: normalizeOptionalInteger(sourceIndex)
    }
  };
}

export function createActorRoleTransferDragDataForActor(actor, {
  actorUuid = "",
  sourceType,
  sourceRole,
  sourceIndex = null
} = {}) {
  if (!actor || actor.documentName !== "Actor") {
    throw new Error("createActorRoleTransferDragDataForActor expected an Actor document.");
  }

  return createActorRoleTransferDragData({
    actorUuid: String(actorUuid ?? "") || String(actor.uuid ?? ""),
    hostActorUuid: actor.uuid ?? "",
    hostActorId: actor.id ?? "",
    sourceType,
    sourceRole,
    sourceIndex
  });
}

export function isActorRoleTransferDragData(dragData) {
  const hasTransferPayload = Boolean(dragData?.[ACTOR_ROLE_TRANSFER_DATA_KEY]);
  if (!hasTransferPayload) return false;

  // Keep backward compatibility with older payloads that used Actor type.
  const dragType = String(dragData?.type ?? "");
  if (dragType.length && dragType !== ACTOR_ROLE_TRANSFER_TYPE && dragType !== DRAG_DATA_TYPES.ACTOR) {
    return false;
  }

  return typeof dragData?.uuid === "string" && dragData.uuid.length > 0;
}

export function getActorRoleTransferData(dragData) {
  const transferData = dragData?.[ACTOR_ROLE_TRANSFER_DATA_KEY];
  if (!transferData || typeof transferData !== "object") return null;

  const actorUuid = String(transferData.actorUuid ?? dragData?.uuid ?? "");
  const sourceType = String(transferData.sourceType ?? "");
  const sourceRole = String(transferData.sourceRole ?? "");

  if (!actorUuid.length || !sourceType.length || !sourceRole.length) return null;

  return {
    actorUuid,
    hostActorUuid: String(transferData.hostActorUuid ?? ""),
    hostActorId: String(transferData.hostActorId ?? ""),
    sourceType,
    sourceRole,
    sourceIndex: normalizeOptionalInteger(transferData.sourceIndex)
  };
}

export function getActorRoleTransferDataFromEvent(event) {
  const dragData = getDragDataFromEvent(event);
  if (!isActorRoleTransferDragData(dragData)) return null;
  return getActorRoleTransferData(dragData);
}

export function isSameActorRoleTransferHost(transferData, actor) {
  if (!transferData || !actor) return false;

  if (transferData.hostActorUuid && actor.uuid) {
    return transferData.hostActorUuid === actor.uuid;
  }

  if (transferData.hostActorId && actor.id) {
    return transferData.hostActorId === actor.id;
  }

  return false;
}

export function isActorRoleTransferEventForHost(event, actor) {
  const transferData = getActorRoleTransferDataFromEvent(event);
  if (!transferData) return false;
  return isSameActorRoleTransferHost(transferData, actor);
}

export function getActorRoleTransferSourceFromElement(element) {
  const sourceElement = getRoleTransferSourceElement(element);
  if (!sourceElement) return null;

  const source = parseRoleTransferLocation(sourceElement, "roleTransferSource");
  if (!source) return null;

  const actorUuid = getActorUuidFromSourceElement(sourceElement);
  if (!actorUuid.length) return null;

  return {
    actorUuid,
    sourceType: source.roleTransferSourceType,
    sourceRole: source.roleTransferSourceRole,
    sourceIndex: source.roleTransferSourceIndex
  };
}

export function getActorRoleTransferSourceFromEvent(event) {
  const sourceElement = getEventPathClosestElement(event, "[data-role-transfer-source]");
  if (!sourceElement) return null;

  return getActorRoleTransferSourceFromElement(sourceElement);
}

export function getActorRoleTransferTargetFromElement(element) {
  const targetElement = getRoleTransferTargetElement(element);
  if (!targetElement) return null;

  const target = parseRoleTransferLocation(targetElement, "roleTransferTarget");
  if (!target) return null;

  return {
    targetType: target.roleTransferTargetType,
    targetRole: target.roleTransferTargetRole,
    targetIndex: target.roleTransferTargetIndex
  };
}

export function getActorRoleTransferTargetFromEvent(event) {
  const targetElement = getEventPathClosestElement(event, "[data-role-transfer-target]");
  if (!targetElement) return null;

  return getActorRoleTransferTargetFromElement(targetElement);
}

export function applyActorRoleTransferDragData(event, dragData) {
  if (!event?.dataTransfer || !dragData || typeof dragData !== "object") {
    return false;
  }

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  return true;
}

export function beginActorRoleTransferDragFromElement(event, actor, element = null) {
  if (!event?.dataTransfer) return null;

  const source = getActorRoleTransferSourceFromElement(element ?? event.target);
  if (!source) return null;

  const dragData = createActorRoleTransferDragDataForActor(actor, source);
  return applyActorRoleTransferDragData(event, dragData) ? dragData : null;
}
