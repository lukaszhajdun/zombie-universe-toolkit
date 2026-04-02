import { createActorReference, isSameActorReference } from "./actor-ref.service.js";

export const ACTOR_ROLE_LAYOUT_STORAGE_TYPES = Object.freeze({
  SLOT: "slot",
  LIST: "list"
});

function isActorDocument(actor) {
  return actor?.documentName === "Actor";
}

function normalizeOptionalInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function hasStoredActorReference(reference) {
  if (!reference || typeof reference !== "object") return false;

  return [
    reference.uuid,
    reference.id,
    reference.name,
    reference.img,
    reference.type
  ].some(value => typeof value === "string" && value.trim().length > 0);
}

function cloneRoleValue(value) {
  return foundry.utils.deepClone(value);
}

function getRoleDefinition(config, role) {
  const definition = config?.roles?.[role];
  return definition && typeof definition === "object" ? definition : null;
}

function getSlotReference(actor, definition) {
  const reference = definition?.getValue?.(actor);
  return hasStoredActorReference(reference) ? cloneRoleValue(reference) : null;
}

function getListReferences(actor, definition) {
  const references = definition?.getValue?.(actor);
  return Array.isArray(references) ? references.map(reference => cloneRoleValue(reference)) : [];
}

function getSourceReference(actor, transferData, config) {
  const definition = getRoleDefinition(config, transferData?.sourceRole);
  if (!definition) return null;

  if (
    definition.storageType === ACTOR_ROLE_LAYOUT_STORAGE_TYPES.SLOT
    && transferData?.sourceType === "slot"
  ) {
    return getSlotReference(actor, definition);
  }

  if (
    definition.storageType === ACTOR_ROLE_LAYOUT_STORAGE_TYPES.LIST
    && transferData?.sourceType === "listItem"
  ) {
    const sourceIndex = normalizeOptionalInteger(transferData?.sourceIndex);
    const references = getListReferences(actor, definition);
    if (sourceIndex === null || sourceIndex < 0 || sourceIndex >= references.length) return null;

    const reference = references[sourceIndex];
    return hasStoredActorReference(reference) ? reference : null;
  }

  return null;
}

function canAssignReference(actor, role, reference, config, context = {}) {
  if (!reference) return true;

  const definition = getRoleDefinition(config, role);
  if (!definition) return false;
  if (typeof definition.canAssign !== "function") return true;

  return definition.canAssign(actor, reference, context) !== false;
}

function createEmptySlotValue(definition) {
  return cloneRoleValue(definition?.emptyValue ?? null);
}

function createOperationKey(transferData, target) {
  return [
    transferData?.sourceRole,
    transferData?.sourceType,
    target?.targetRole,
    target?.targetType
  ].join(":");
}

function createBaseUpdates(actor, config, transferData, target) {
  const sourceDefinition = getRoleDefinition(config, transferData.sourceRole);
  const targetDefinition = getRoleDefinition(config, target.targetRole);

  if (!sourceDefinition || !targetDefinition) return null;

  return {
    actor,
    config,
    transferData,
    target,
    sourceDefinition,
    targetDefinition,
    sourceIndex: normalizeOptionalInteger(transferData.sourceIndex),
    targetIndex: normalizeOptionalInteger(target.targetIndex)
  };
}

async function applyActorUpdates(actor, updates, status, extra = {}) {
  await actor.update(updates);
  return { status, ...extra };
}

async function transferSlotToSlot(operation, base) {
  const {
    actor,
    config,
    transferData,
    sourceDefinition,
    target,
    targetDefinition
  } = base;

  const sourceReference = getSourceReference(actor, transferData, config);
  if (!sourceReference) return { status: "missingSource" };

  const targetReference = getSlotReference(actor, targetDefinition);
  const updates = {
    [targetDefinition.updatePath]: sourceReference
  };

  if (operation.preserveSource === true) {
    return applyActorUpdates(actor, updates, "assigned");
  }

  if (targetReference && operation.onOccupied === "swap") {
    if (!canAssignReference(actor, transferData.sourceRole, targetReference, config, { sourceRole: target.targetRole })) {
      return { status: "invalidSwap" };
    }

    updates[sourceDefinition.updatePath] = targetReference;
    return applyActorUpdates(actor, updates, "swapped");
  }

  updates[sourceDefinition.updatePath] = createEmptySlotValue(sourceDefinition);
  return applyActorUpdates(actor, updates, "assigned");
}

async function transferSlotToList(base) {
  const {
    actor,
    config,
    transferData,
    sourceDefinition,
    target,
    targetDefinition,
    targetIndex
  } = base;

  const sourceReference = getSourceReference(actor, transferData, config);
  if (!sourceReference) return { status: "missingSource" };

  const targetList = getListReferences(actor, targetDefinition);
  const insertIndex = target.targetType === "listItem" && targetIndex !== null
    ? Math.max(0, Math.min(targetIndex, targetList.length))
    : targetList.length;

  targetList.splice(insertIndex, 0, sourceReference);

  return applyActorUpdates(
    actor,
    {
      [sourceDefinition.updatePath]: createEmptySlotValue(sourceDefinition),
      [targetDefinition.updatePath]: targetList
    },
    "moved"
  );
}

async function transferSlotToListItem(operation, base) {
  const {
    actor,
    config,
    transferData,
    sourceDefinition,
    targetDefinition,
    targetIndex
  } = base;

  const sourceReference = getSourceReference(actor, transferData, config);
  if (!sourceReference) return { status: "missingSource" };

  const targetList = getListReferences(actor, targetDefinition);
  if (targetIndex === null || targetIndex < 0 || targetIndex >= targetList.length) {
    return { status: "missingTarget" };
  }

  const targetReference = targetList[targetIndex];
  if (!hasStoredActorReference(targetReference)) {
    return { status: "missingTarget" };
  }

  targetList[targetIndex] = sourceReference;

  if (operation.onOccupied === "swap") {
    if (!canAssignReference(actor, transferData.sourceRole, targetReference, config, { sourceRole: base.target.targetRole })) {
      return { status: "invalidSwap" };
    }

    return applyActorUpdates(
      actor,
      {
        [sourceDefinition.updatePath]: targetReference,
        [targetDefinition.updatePath]: targetList
      },
      "swapped"
    );
  }

  return applyActorUpdates(
    actor,
    {
      [sourceDefinition.updatePath]: createEmptySlotValue(sourceDefinition),
      [targetDefinition.updatePath]: targetList
    },
    "moved"
  );
}

async function transferListItemToSlot(operation, base) {
  const {
    actor,
    config,
    sourceDefinition,
    target,
    targetDefinition,
    sourceIndex,
    transferData
  } = base;

  const sourceReference = getSourceReference(actor, transferData, config);
  if (!sourceReference) return { status: "missingSource" };

  const sourceList = getListReferences(actor, sourceDefinition);
  if (sourceIndex === null || sourceIndex < 0 || sourceIndex >= sourceList.length) {
    return { status: "missingSource" };
  }

  const targetReference = getSlotReference(actor, targetDefinition);
  const updates = {
    [targetDefinition.updatePath]: sourceReference
  };

  if (operation.preserveSource === true) {
    return applyActorUpdates(actor, updates, "assigned");
  }

  if (targetReference && operation.onOccupied === "swap") {
    if (!canAssignReference(actor, transferData.sourceRole, targetReference, config, { sourceRole: target.targetRole })) {
      return { status: "invalidSwap" };
    }

    sourceList[sourceIndex] = targetReference;
    updates[sourceDefinition.updatePath] = sourceList;
    return applyActorUpdates(actor, updates, "swapped");
  }

  sourceList.splice(sourceIndex, 1);
  updates[sourceDefinition.updatePath] = sourceList;
  return applyActorUpdates(actor, updates, "assigned");
}

async function transferListItemToList(base) {
  const {
    actor,
    sourceDefinition,
    targetDefinition,
    sourceIndex
  } = base;

  const sourceList = getListReferences(actor, sourceDefinition);
  if (sourceIndex === null || sourceIndex < 0 || sourceIndex >= sourceList.length) {
    return { status: "missingSource" };
  }

  if (sourceDefinition.updatePath === targetDefinition.updatePath && sourceIndex === sourceList.length - 1) {
    return { status: "noop" };
  }

  const [sourceReference] = sourceList.splice(sourceIndex, 1);
  if (!hasStoredActorReference(sourceReference)) {
    return { status: "missingSource" };
  }

  if (sourceDefinition.updatePath === targetDefinition.updatePath) {
    sourceList.push(sourceReference);
    return applyActorUpdates(actor, { [sourceDefinition.updatePath]: sourceList }, "reordered");
  }

  const targetList = getListReferences(actor, targetDefinition);
  targetList.push(sourceReference);

  return applyActorUpdates(
    actor,
    {
      [sourceDefinition.updatePath]: sourceList,
      [targetDefinition.updatePath]: targetList
    },
    "moved"
  );
}

async function transferListItemToListItem(base) {
  const {
    actor,
    sourceDefinition,
    targetDefinition,
    sourceIndex,
    targetIndex
  } = base;

  const sourceList = getListReferences(actor, sourceDefinition);
  if (sourceIndex === null || sourceIndex < 0 || sourceIndex >= sourceList.length) {
    return { status: "missingSource" };
  }

  const targetList = sourceDefinition.updatePath === targetDefinition.updatePath
    ? sourceList
    : getListReferences(actor, targetDefinition);

  if (targetIndex === null || targetIndex < 0 || targetIndex >= targetList.length) {
    return { status: "missingTarget" };
  }

  if (sourceDefinition.updatePath === targetDefinition.updatePath && sourceIndex === targetIndex) {
    return { status: "noop" };
  }

  const sourceReference = sourceList[sourceIndex];
  const targetReference = targetList[targetIndex];

  if (!hasStoredActorReference(sourceReference) || !hasStoredActorReference(targetReference)) {
    return { status: "missingTarget" };
  }

  sourceList[sourceIndex] = targetReference;
  targetList[targetIndex] = sourceReference;

  if (sourceDefinition.updatePath === targetDefinition.updatePath) {
    return applyActorUpdates(actor, { [sourceDefinition.updatePath]: sourceList }, "swapped");
  }

  return applyActorUpdates(
    actor,
    {
      [sourceDefinition.updatePath]: sourceList,
      [targetDefinition.updatePath]: targetList
    },
    "swapped"
  );
}

export function doesActorRoleLayoutSourceMatchActor(actor, transferData, draggedActor, config) {
  if (!isActorDocument(actor) || !isActorDocument(draggedActor)) return false;

  const sourceReference = getSourceReference(actor, transferData, config);
  if (!sourceReference) return false;

  return isSameActorReference(sourceReference, createActorReference(draggedActor));
}

export async function transferActorRoleByLayout(actor, draggedActor, transferData, target, config) {
  if (!isActorDocument(actor) || !isActorDocument(draggedActor)) {
    return { status: "invalid" };
  }

  if (!transferData || typeof transferData !== "object") {
    return { status: "invalid" };
  }

  if (!target || typeof target !== "object") {
    return { status: "invalid" };
  }

  if (!doesActorRoleLayoutSourceMatchActor(actor, transferData, draggedActor, config)) {
    return { status: "invalidSourceActor" };
  }

  const operation = config?.operations?.[createOperationKey(transferData, target)];
  if (!operation) return { status: "invalidTarget" };

  const base = createBaseUpdates(actor, config, transferData, target);
  if (!base) return { status: "invalid" };

  switch (operation.type) {
    case "slotToSlot":
      return transferSlotToSlot(operation, base);

    case "slotToList":
      return transferSlotToList(base);

    case "slotToListItem":
      return transferSlotToListItem(operation, base);

    case "listItemToSlot":
      return transferListItemToSlot(operation, base);

    case "listItemToList":
      return transferListItemToList(base);

    case "listItemToListItem":
      return transferListItemToListItem(base);

    default:
      return { status: "invalid" };
  }
}
