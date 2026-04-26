import {
  ACTOR_FLAGS,
  CSS_CLASSES,
  LOCALIZATION_PREFIX,
  MODULE_ID
} from "../core/constants.js";
import { logger } from "../core/logger.js";
import {
  createActorRoleTransferDragDataForActor,
  getActorRoleTransferData,
  getActorRoleTransferSourceFromElement,
  getActorRoleTransferTargetFromEvent,
  isActorRoleTransferEventForHost
} from "../services/actor-role-transfer.service.js";
import {
  getDragDataFromEvent,
  isActorDragData,
  isDragLeavingDropZone,
  resolveActorFromDragData,
  setDropZoneActive
} from "../services/dragdrop.service.js";
import { ActorRoleDnDController } from "./controllers/actor-role-dnd-controller.js";
import { ActorRoleDnDFallbackStrategy } from "./controllers/actor-role-dnd-fallback-strategy.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { FilePicker } = foundry.applications.apps;

export class BaseModuleActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  #roleDnDController = new ActorRoleDnDController(this);
  #roleDnDFallback = new ActorRoleDnDFallbackStrategy(this);
  #handledDropEvents = new WeakSet();

  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "actor",
      "standard-form",
      CSS_CLASSES.ROOT,
      "zut-sheet-app",
      "zut-actor-sheet"
    ]));

    options.form = foundry.utils.mergeObject(
      options.form ?? {},
      {
        submitOnChange: false,
        closeOnSubmit: false
      },
      { inplace: false }
    );

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 720 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-shapes",
        resizable: true,
        contentClasses: Array.from(new Set([
          ...(options.window?.contentClasses ?? []),
          "zut-sheet"
        ]))
      },
      { inplace: false }
    );

    return options;
  }

  get title() {
    const name = this.document?.name?.trim();
    if (name) return name;
    return game.i18n.localize(`${LOCALIZATION_PREFIX}.Sheets.Common.Unnamed`);
  }

  get isSheetLocked() {
    const explicitLockState = this.document?.getFlag(MODULE_ID, ACTOR_FLAGS.EDIT_LOCKED);
    if (typeof explicitLockState === "boolean") return explicitLockState;
    return false;
  }

  get canEditDocument() {
    return this.isEditable && !this.isSheetLocked;
  }

  get canToggleLock() {
    return this.isEditable;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const lockToggleKey = this.isSheetLocked
      ? `${LOCALIZATION_PREFIX}.Sheets.Common.Actions.UnlockEditing`
      : `${LOCALIZATION_PREFIX}.Sheets.Common.Actions.LockEditing`;

    return foundry.utils.mergeObject(
      context,
      {
        moduleId: MODULE_ID,
        cssClass: CSS_CLASSES.ROOT,
        rootId: this.id,
        actor: this.actor,
        system: this.actor.system,
        owner: this.actor.isOwner,
        editable: this.canEditDocument,
        canEdit: this.canEditDocument,
        canToggleLock: this.canToggleLock,
        isLocked: this.isSheetLocked,
        lockToggleLabel: game.i18n.localize(lockToggleKey),
        lockToggleTitle: game.i18n.localize(lockToggleKey),
        lockToggleIcon: this.isSheetLocked ? "fa-solid fa-lock" : "fa-solid fa-lock-open",
        title: this.title
      },
      { inplace: false }
    );
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls();

    const seen = new Set();
    const filtered = [];

    for (const control of controls) {
      const action = control?.action ?? "";
      const label = control?.label ?? "";
      const key = action || label;

      if (!key) continue;
      if (action === "configureToken") continue;
      if (seen.has(key)) continue;

      seen.add(key);
      filtered.push(control);
    }

    return filtered;
  }

  _canDragStart(_selector) {
    return this.canEditDocument;
  }

  _canDragDrop(_selector) {
    return this.canEditDocument;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._bindBaseListeners();
  }

  async close(options = {}) {
    this._unbindBaseListeners();
    return super.close(options);
  }

  _getDropZoneRoot() {
    return this.form;
  }

  _getDropZoneIds() {
    return [];
  }

  _isTrackedDropZone(dropZoneId) {
    return this._getDropZoneIds().includes(dropZoneId);
  }

  _canDragOverDropZone(dropZoneId, _event) {
    return this.canEditDocument && this._isTrackedDropZone(dropZoneId);
  }

  _getDropZoneDropEffect(_dropZoneId, _event) {
    return "copy";
  }

  _getDelegatedDragStartElement(source) {
    const target = source?.target instanceof Element
      ? source.target
      : source instanceof Element
        ? source
        : null;

    if (!(target instanceof Element)) return null;
    return target.closest("[data-role-transfer-source]");
  }

  async _onDelegatedDragStart(_event, _dragSource) {
    return false;
  }

  _unbindBaseListeners() {
    this.#roleDnDController.unbind();
  }

  _bindBaseListeners() {
    const root = this._getDropZoneRoot();
    this.#roleDnDController.bind(root);
  }

  _getSheetClickActionMap() {
    return [];
  }

  _dispatchSheetClickActions(event, actionMap = this._getSheetClickActionMap()) {
    const target = event?.target;
    if (!(target instanceof Element)) return false;
    if (!Array.isArray(actionMap) || actionMap.length === 0) return false;

    for (const action of actionMap) {
      const selector = String(action?.selector ?? "").trim();
      const handler = action?.handler;

      if (!selector || typeof handler !== "function") continue;

      const matched = target.closest(selector);
      if (!(matched instanceof Element)) continue;

      handler(event, matched);
      return true;
    }

    return false;
  }

  _onBaseClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const lockToggle = target.closest("[data-lock-toggle]");
    if (lockToggle) {
      void this._onToggleEditLock(event);
      return;
    }

    this._dispatchSheetClickActions(event);
  }

  _onBaseChange(event) {
    if (!this.canEditDocument) return;

    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
      return;
    }

    if (!element.name?.trim()) return;
    void this._onAutoSaveFieldChangeForElement(element);
  }

  _onBaseKeyDown(event) {
    if (event.key !== "Enter") return;
    if (event.isComposing) return;

    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) return;
    if (element instanceof HTMLInputElement && this._allowsEnterInputSubmit(element)) return;
    if (!element.name?.trim()) return;

    event.preventDefault();
    event.stopPropagation();
    element.blur();
  }

  _allowsEnterInputSubmit(element) {
    return ["button", "checkbox", "color", "file", "hidden", "image", "radio", "reset", "submit"].includes(element.type);
  }

  async _onPortraitEdit(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    const current = this.actor.img ?? "";
    const initialTarget = current.includes("/") ? current.split("/").slice(0, -1).join("/") : "";

    const picker = new FilePicker({
      type: "image",
      current,
      callback: async path => {
        if (!path || path === this.actor.img) return;
        await this.actor.update({ img: path });
      }
    });

    await picker.browse(initialTarget);
  }

  async #resolveInternalTransferActor(dragData) {
    let actor = null;
    const transferData = getActorRoleTransferData(dragData);

    if (transferData?.actorUuid) {
      try {
        const resolved = await fromUuid(transferData.actorUuid);
        actor = resolved?.documentName === "Actor" ? resolved : null;
      } catch (_error) {
        actor = null;
      }
    }

    if (!actor && isActorDragData(dragData)) {
      actor = await resolveActorFromDragData(dragData);
    }

    return actor ?? null;
  }

  #createSyntheticDropEvent(target, payload) {
    const root = this._getDropZoneRoot();

    return {
      target,
      dataTransfer: {
        types: ["text/plain"],
        getData: type => (type === "text/plain" ? payload : "")
      },
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
      composedPath() {
        return root instanceof Element ? [target, root] : [target];
      }
    };
  }

  async _onBaseDragStart(event) {
    const dragSource = this._getDelegatedDragStartElement(event);

    if (!dragSource) return false;
    if (!this.canEditDocument) return false;

    const handled = await this._onDelegatedDragStart(event, dragSource);
    if (!handled) return false;

    let dragData = getDragDataFromEvent(event);
    if (!dragData) {
      const source = getActorRoleTransferSourceFromElement(dragSource);
      if (source) {
        dragData = createActorRoleTransferDragDataForActor(this.actor, source);
      }
    }

    this.#roleDnDFallback.activate(dragData);

    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  }

  async _onBaseDragEnd(event) {
    try {
      await this._finalizeInternalDragFallback("dragend", event);
    } finally {
      this.#roleDnDFallback.reset();
      this._clearDropZoneHighlights();
    }
  }

  async _onDragStart(event) {
    const handled = await this._onBaseDragStart(event);
    if (handled) return;
    return super._onDragStart(event);
  }

  _getDropZoneElementFromSource(source) {
    const target = source?.target instanceof Element
      ? source.target
      : source instanceof Element
        ? source
        : null;

    const dropZone = target?.closest("[data-drop-zone]") ?? null;
    if (!dropZone) return null;

    const dropZoneId = String(dropZone.dataset.dropZone ?? "");
    return this._isTrackedDropZone(dropZoneId) ? dropZone : null;
  }

  _clearDropZoneHighlights() {
    const root = this._getDropZoneRoot();
    if (!(root instanceof Element)) return;

    for (const dropZone of root.querySelectorAll("[data-drop-zone].is-dragover")) {
      setDropZoneActive(dropZone, false);
    }

    for (const transferTarget of root.querySelectorAll("[data-role-transfer-target].is-dragover")) {
      setDropZoneActive(transferTarget, false);
    }
  }

  _activateDropZone(dropZone) {
    this._clearDropZoneHighlights();
    setDropZoneActive(dropZone, true);
  }

  _getRoleTransferTargetElement(event) {
    const transferTarget = event?.target instanceof Element
      ? event.target.closest("[data-role-transfer-target]")
      : null;

    return transferTarget instanceof Element ? transferTarget : null;
  }

  _onBaseDragEnter(event) {
    const dropZone = this._getDropZoneElementFromSource(event);
    if (!dropZone) return;

    const dropZoneId = String(dropZone.dataset.dropZone ?? "");
    if (!this._canDragOverDropZone(dropZoneId, event)) return;

    event.preventDefault();
    this._activateDropZone(dropZone);
  }

  _onBaseDragOver(event) {
    // Browsers often do not expose dataTransfer payload during dragover.
    // Keep drop enabled while an internal role drag is active.
    if (this.#roleDnDFallback.isActive) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }

    const dropZone = this._getDropZoneElementFromSource(event);
    if (!dropZone) {
      const transferTarget = this._getRoleTransferTargetElement(event);
      if (!transferTarget || !getActorRoleTransferTargetFromEvent(event)) {
        this.#roleDnDFallback.clearTargetAndHighlights();
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }

      this.#roleDnDFallback.rememberTarget(transferTarget);
      this._activateDropZone(transferTarget);
      return;
    }

    const dropZoneId = String(dropZone.dataset.dropZone ?? "");
    if (!this._canDragOverDropZone(dropZoneId, event)) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this._getDropZoneDropEffect(dropZoneId, event);
    }

    this._activateDropZone(dropZone);
  }

  _onBaseDragLeave(event) {
    const dropZone = this._getDropZoneElementFromSource(event);
    if (!dropZone) return;
    if (!isDragLeavingDropZone(event, dropZone)) return;

    setDropZoneActive(dropZone, false);
  }

  _isEventWithinSheetRoot(event) {
    const root = this._getDropZoneRoot();
    if (!(root instanceof Element)) return false;

    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    if (Array.isArray(path) && path.includes(root)) return true;

    const target = event?.target;
    if (target instanceof Node && root.contains(target)) return true;

    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const bounds = root.getBoundingClientRect();
      if (
        clientX >= bounds.left
        && clientX <= bounds.right
        && clientY >= bounds.top
        && clientY <= bounds.bottom
      ) {
        return true;
      }
    }

    return false;
  }

  _onDocumentDragOver(event) {
    if (!this.#roleDnDFallback.isActive) return;
    if (!this._isEventWithinSheetRoot(event)) {
      this.#roleDnDFallback.clearTargetAndHighlights();
      return;
    }
    this._onBaseDragOver(event);

    const pointerTarget = this._getRoleTransferTargetElementAtPoint(event?.clientX, event?.clientY);
    if (pointerTarget) {
      this.#roleDnDFallback.rememberTarget(pointerTarget);
    }
  }

  async _onDocumentDrop(event) {
    if (!this.#roleDnDFallback.isActive) return;
    if (!this._isEventWithinSheetRoot(event)) return;
    await this._onBaseDrop(event);
  }

  async _onDocumentPointerUp(event) {
    if (!this.#roleDnDFallback.isActive) return;
    if (this.#roleDnDFallback.dropHandled) return;

    const pointerTarget = this._getRoleTransferTargetElementAtPoint(event?.clientX, event?.clientY);
    if (pointerTarget instanceof Element) {
      this.#roleDnDFallback.rememberTarget(pointerTarget);
    }

    await this._finalizeInternalDragFallback("pointerup", event);
  }

  _getRoleTransferTargetElementAtPoint(clientX, clientY) {
    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const elementAtPoint = document.elementFromPoint(x, y);
    if (!(elementAtPoint instanceof Element)) return null;

    const root = this._getDropZoneRoot();
    if (!(root instanceof Element)) return null;
    if (!root.contains(elementAtPoint)) return null;

    const transferTarget = elementAtPoint.closest("[data-role-transfer-target]");
    return transferTarget instanceof Element ? transferTarget : null;
  }

  async _finalizeInternalDragFallback(reason, event = null) {
    await this.#roleDnDFallback.finalizeFallback(reason, event, {
      resolveTargetAtPoint: (clientX, clientY) => this._getRoleTransferTargetElementAtPoint(clientX, clientY),
      createSyntheticDropEvent: (target, payload) => this.#createSyntheticDropEvent(target, payload),
      resolveActor: dragData => this.#resolveInternalTransferActor(dragData),
      onDropActor: (syntheticEvent, actor) => this._onDropActor(syntheticEvent, actor)
    });
  }

  async _onBaseDrop(event) {
    if (this.#handledDropEvents.has(event)) return;
    this.#handledDropEvents.add(event);

    this.#roleDnDFallback.markDropHandled();

    const dropZone = this._getDropZoneElementFromSource(event);
    if (dropZone) {
      event.preventDefault();
      setDropZoneActive(dropZone, false);
    }

    this._clearDropZoneHighlights();

    const dragData = getDragDataFromEvent(event);
    if (!dragData) return;

    event.stopPropagation();
    event.stopImmediatePropagation();
    await this._onDrop(event);
  }

  async _onDrop(event) {
    const dragData = getDragDataFromEvent(event);
    if (isActorRoleTransferEventForHost(event, this.actor)) {
      event.preventDefault();
      const actor = await this.#resolveInternalTransferActor(dragData);

      return this._onDropActor(event, actor ?? null);
    }

    if (isActorDragData(dragData)) {
      event.preventDefault();
      const actor = await resolveActorFromDragData(dragData);
      return this._onDropActor(event, actor ?? null);
    }

    return super._onDrop(event);
  }

  async _onToggleEditLock(event) {
    event.preventDefault();

    if (!this.canToggleLock) return;

    const nextLockedState = !this.isSheetLocked;

    try {
      await this.document.setFlag(MODULE_ID, ACTOR_FLAGS.EDIT_LOCKED, nextLockedState);
    } catch (error) {
      logger.error("Failed to toggle edit lock state.", error);
      ui.notifications?.error(game.i18n.localize(`${LOCALIZATION_PREFIX}.Errors.EditLockToggleFailed`));
    }
  }

  async _onAutoSaveFieldChange(event) {
    const element = event?.currentTarget ?? event?.target ?? null;
    return this._onAutoSaveFieldChangeForElement(element);
  }

  async _onAutoSaveFieldChangeForElement(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
      return;
    }

    const fieldName = element.name?.trim();
    if (!fieldName) return;

    const value = this._getAutoSaveFieldValue(element);
    const updateData = this._getAutoSaveFieldUpdateData(element, fieldName, value);

    try {
      await this.document.update(updateData);
    } catch (error) {
      logger.error(`Failed to auto-save field "${fieldName}".`, error);
      ui.notifications?.error(game.i18n.localize(`${LOCALIZATION_PREFIX}.Errors.AutoSaveFailed`));
    }
  }

  _getAutoSaveFieldValue(element) {
    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox") return element.checked;
      if (element.type === "number") {
        if (element.value === "") return null;
        return Number(element.value);
      }
    }

    return element.value;
  }

  _getAutoSaveFieldUpdateData(_element, fieldName, value) {
    return foundry.utils.expandObject({ [fieldName]: value });
  }
}
