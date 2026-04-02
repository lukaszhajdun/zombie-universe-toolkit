const TextEditor = foundry.applications.ux.TextEditor.implementation;

export const DRAG_DATA_TYPES = Object.freeze({
  ACTOR: "Actor",
  ITEM: "Item"
});

export function getDragDataFromEvent(event) {
  try {
    const dragData = TextEditor.getDragEventData(event);
    return dragData && typeof dragData === "object" ? dragData : null;
  } catch (_error) {
    return null;
  }
}

export function isActorDragData(dragData) {
  return dragData?.type === DRAG_DATA_TYPES.ACTOR;
}

export function isItemDragData(dragData) {
  return dragData?.type === DRAG_DATA_TYPES.ITEM;
}

export async function resolveActorFromDragData(dragData) {
  if (!isActorDragData(dragData)) return null;

  try {
    const ActorDocument = getDocumentClass("Actor");
    return await ActorDocument.fromDropData(dragData);
  } catch (_error) {
    return null;
  }
}

export async function resolveItemFromDragData(dragData) {
  if (!isItemDragData(dragData)) return null;

  try {
    const ItemDocument = getDocumentClass("Item");
    return await ItemDocument.fromDropData(dragData);
  } catch (_error) {
    return null;
  }
}

export function getDropZoneElement(root, dropZoneId) {
  if (!(root instanceof Element) || typeof dropZoneId !== "string" || !dropZoneId.length) {
    return null;
  }

  return root.querySelector(`[data-drop-zone='${dropZoneId}']`);
}

export function getClosestDropZoneId(source) {
  const target = source?.target instanceof Element
    ? source.target
    : source instanceof Element
      ? source
      : null;

  return target?.closest("[data-drop-zone]")?.dataset?.dropZone ?? "";
}

export function isDragLeavingDropZone(event, dropZone) {
  if (!(dropZone instanceof Element)) return true;

  const relatedTarget = event.relatedTarget;
  if (!(relatedTarget instanceof Node)) return true;

  return !dropZone.contains(relatedTarget);
}

export function setDropZoneActive(dropZone, isActive) {
  if (!(dropZone instanceof Element)) return;
  dropZone.classList.toggle("is-dragover", isActive);
}

export function applyCopyDropEffect(event) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}
