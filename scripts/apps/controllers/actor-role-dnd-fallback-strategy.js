/**
 * Encapsulates fallback behavior for internal role drag-and-drop when native
 * browser drop events are not reliably emitted.
 */
export class ActorRoleDnDFallbackStrategy {
  #sheet;
  #isActive = false;
  #dropHandled = false;
  #activeDragData = null;
  #lastTarget = null;

  constructor(sheet) {
    this.#sheet = sheet;
  }

  get isActive() {
    return this.#isActive;
  }

  get dropHandled() {
    return this.#dropHandled;
  }

  get activeDragData() {
    return this.#activeDragData;
  }

  activate(dragData) {
    this.#isActive = true;
    this.#dropHandled = false;
    this.#lastTarget = null;
    this.#activeDragData = dragData ?? null;
  }

  markDropHandled() {
    this.#isActive = false;
    this.#dropHandled = true;
  }

  rememberTarget(target) {
    this.#lastTarget = target instanceof Element ? target : null;
  }

  clearTargetAndHighlights() {
    this.#lastTarget = null;
    this.#sheet._clearDropZoneHighlights();
  }

  reset() {
    this.#isActive = false;
    this.#activeDragData = null;
    this.#lastTarget = null;
    this.#dropHandled = false;
  }

  async finalizeFallback(reason, event, options) {
    void reason;
    if (!this.#isActive) return;
    if (this.#dropHandled) return;
    if (!this.#activeDragData) return;

    const {
      resolveTargetAtPoint,
      createSyntheticDropEvent,
      resolveActor,
      onDropActor
    } = options;

    const pointerClientX = Number(event?.clientX ?? NaN);
    const pointerClientY = Number(event?.clientY ?? NaN);
    const hasPointerCoordinates = Number.isFinite(pointerClientX) && Number.isFinite(pointerClientY);

    let target = resolveTargetAtPoint(pointerClientX, pointerClientY);
    if (!(target instanceof Element) && !hasPointerCoordinates) {
      target = this.#lastTarget;
    }

    if (!(target instanceof Element)) return;

    const payload = JSON.stringify(this.#activeDragData);
    const syntheticEvent = createSyntheticDropEvent(target, payload);

    const dragData = this.#activeDragData;
    if (!dragData || typeof dragData !== "object") return;

    this.#dropHandled = true;
    const actor = await resolveActor(dragData);
    await onDropActor(syntheticEvent, actor ?? null);
  }
}
