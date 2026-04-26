import { logger } from "../../core/logger.js";

/**
 * Centralizes DnD listener lifecycle and event wiring for actor sheets.
 * The sheet still owns transfer rules and business logic.
 */
export class ActorRoleDnDController {
  #sheet;
  #listenerController = null;

  constructor(sheet) {
    this.#sheet = sheet;
  }

  unbind() {
    this.#listenerController?.abort();
    this.#listenerController = null;
  }

  bind(root) {
    this.unbind();
    if (!(root instanceof Element)) return;

    const controller = new AbortController();
    const { signal } = controller;
    const sheet = this.#sheet;

    root.addEventListener("click", event => sheet._onBaseClick(event), { signal });
    root.addEventListener("change", event => sheet._onBaseChange(event), { signal });
    root.addEventListener("keydown", event => sheet._onBaseKeyDown(event), { signal, capture: true });
    root.addEventListener("dragend", event => {
      void sheet._onBaseDragEnd(event);
    }, { signal });
    root.addEventListener("dragenter", event => sheet._onBaseDragEnter(event), { signal, capture: true });
    root.addEventListener("dragover", event => sheet._onBaseDragOver(event), { signal, capture: true });
    root.addEventListener("dragleave", event => sheet._onBaseDragLeave(event), { signal, capture: true });
    root.addEventListener("drop", event => {
      void sheet._onBaseDrop(event).catch(error => {
        logger.error("Role DnD drop handler error.", error);
      });
    }, { signal, capture: true });

    // Fallback for browsers/hosts where sheet-level drop listeners are preempted.
    document.addEventListener("dragover", event => sheet._onDocumentDragOver(event), { signal, capture: true });
    document.addEventListener("drop", event => {
      void sheet._onDocumentDrop(event).catch(error => {
        logger.error("Role DnD document drop handler error.", error);
      });
    }, { signal, capture: true });
    document.addEventListener("pointerup", event => {
      void sheet._onDocumentPointerUp(event).catch(error => {
        logger.error("Role DnD document pointerup handler error.", error);
      });
    }, { signal, capture: true });
    document.addEventListener("mouseup", event => {
      void sheet._onDocumentPointerUp(event).catch(error => {
        logger.error("Role DnD document mouseup handler error.", error);
      });
    }, { signal, capture: true });

    for (const dragSource of root.querySelectorAll("[data-role-transfer-source]")) {
      dragSource.addEventListener("dragstart", event => {
        void sheet._onBaseDragStart(event);
      }, { signal });

      dragSource.addEventListener("dragend", () => {
        void sheet._onBaseDragEnd();
      }, { signal });
    }

    this.#listenerController = controller;
  }
}
