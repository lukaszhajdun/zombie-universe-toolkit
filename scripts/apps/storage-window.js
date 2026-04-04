import {
  CSS_CLASSES,
  MODULE_ID
} from "../core/constants.js";
import {
  applyCopyDropEffect,
  isDragLeavingDropZone,
  setDropZoneActive
} from "../services/dragdrop.service.js";
import {
  addItemToStorage,
  createStorageTransferDragData,
  getStorageDragDataFromEvent,
  isStorageTransferDragData,
  resolveDroppedItemDocument
} from "../services/storage-transfer.service.js";
import {
  openStorageItemSheet,
  prepareStorageWindowContext,
  removeStorageItem,
  updateStorageSlotCapacity
} from "../services/storage.service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class StorageWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  #actor;
  #slotId;
  #hookRefs;
  #hooksRegistered;
  #listenerController;
  #refreshInFlight;
  #refreshQueued;

  constructor(options = {}) {
    super(options);

    this.#actor = options.actor ?? null;
    this.#slotId = options.slotId ?? "";
    this.#hookRefs = [];
    this.#hooksRegistered = false;
    this.#listenerController = null;
    this.#refreshInFlight = false;
    this.#refreshQueued = false;
  }

  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      CSS_CLASSES.ROOT,
      "zut-storage-window"
    ]));

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      {
        width: 760,
        height: 840
      },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-box-open",
        resizable: true
      },
      { inplace: false }
    );

    return options;
  }

  static get PARTS() {
    return {
      body: {
        template: `modules/${MODULE_ID}/templates/storage/storage-window.hbs`
      }
    };
  }

  get actor() {
    return this.#actor;
  }

  get slotId() {
    return this.#slotId;
  }

  get title() {
    if (!this.actor) return game.i18n.localize("ZUT.Storage.Window.TitleFallback");

    const context = prepareStorageWindowContext(this.actor, this.slotId);
    return game.i18n.format("ZUT.Storage.Window.Title", {
      storage: context.storage.label,
      actor: context.storage.hostName
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    return foundry.utils.mergeObject(
      context,
      prepareStorageWindowContext(this.actor, this.slotId),
      { inplace: false }
    );
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#registerDocumentHooks();
    this.#bindUiListeners();
  }

  async close(options = {}) {
    this.#unbindUiListeners();
    this.#unregisterDocumentHooks();
    return super.close(options);
  }

  #registerHook(event, callback) {
    const id = Hooks.on(event, callback);
    this.#hookRefs.push({ event, id });
  }

  #registerDocumentHooks() {
    if (this.#hooksRegistered) return;

    this.#registerHook("updateActor", actor => {
      if (actor?.id !== this.actor?.id) return;
      void this.#queueRefresh();
    });

    this.#registerHook("createItem", item => {
      if (item?.parent?.id !== this.actor?.id) return;
      void this.#queueRefresh();
    });

    this.#registerHook("updateItem", item => {
      if (item?.parent?.id !== this.actor?.id) return;
      void this.#queueRefresh();
    });

    this.#registerHook("deleteItem", item => {
      if (item?.parent?.id !== this.actor?.id) return;
      void this.#queueRefresh();
    });

    this.#hooksRegistered = true;
  }

  #unregisterDocumentHooks() {
    for (const hookRef of this.#hookRefs) {
      Hooks.off(hookRef.event, hookRef.id);
    }

    this.#hookRefs = [];
    this.#hooksRegistered = false;
  }

  #unbindUiListeners() {
    this.#listenerController?.abort();
    this.#listenerController = null;
  }

  #bindUiListeners() {
    this.#unbindUiListeners();

    const root = this.element?.querySelector("[data-storage-root]");
    const dropZone = this.element?.querySelector("[data-storage-drop-zone]");
    if (!root || !dropZone) return;

    const controller = new AbortController();
    const { signal } = controller;

    dropZone.addEventListener("dragenter", event => this._onDragEnter(event), { signal });
    dropZone.addEventListener("dragover", event => this._onDragOver(event), { signal });
    dropZone.addEventListener("dragleave", event => this._onDragLeave(event), { signal });
    dropZone.addEventListener("drop", event => void this._onDropToStorage(event), { signal });

    root.addEventListener("click", event => {
      this._dispatchClickActions(event);
    }, { signal });

    root.addEventListener("dragstart", event => {
      const row = event.target.closest("[data-storage-item-drag]");
      if (row) {
        this._onItemDragStart(event, row);
      }
    }, { signal });

    root.addEventListener("change", event => {
      const capacityInput = event.target.closest("[data-storage-capacity-input]");
      if (capacityInput) {
        void this._onCapacityChange(event, capacityInput);
      }
    }, { signal });

    root.addEventListener("keydown", event => {
      const capacityInput = event.target.closest("[data-storage-capacity-input]");
      if (!capacityInput) return;
      if (event.key !== "Enter") return;

      event.preventDefault();
      capacityInput.blur();
    }, { signal });

    this.#listenerController = controller;
  }

  _getClickActionMap() {
    return [
      {
        selector: "[data-storage-item-remove]",
        handler: (event, element) => {
          void this._onItemRemove(event, element);
        }
      },
      {
        selector: "[data-storage-item-open]",
        handler: (event, element) => {
          void this._onItemOpen(event, element);
        }
      }
    ];
  }

  _dispatchClickActions(event, actionMap = this._getClickActionMap()) {
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

  async #queueRefresh() {
    if (!this.rendered) return;

    if (this.#refreshInFlight) {
      this.#refreshQueued = true;
      return;
    }

    this.#refreshInFlight = true;

    try {
      await this.render(false);
    } finally {
      this.#refreshInFlight = false;

      if (this.#refreshQueued) {
        this.#refreshQueued = false;
        await this.#queueRefresh();
      }
    }
  }

  #setDragoverState(isActive) {
    const root = this.element?.querySelector("[data-storage-root]");
    if (!root) return;

    root.classList.toggle("is-dragover", isActive);
  }

  #canModifyItems() {
    return prepareStorageWindowContext(this.actor, this.slotId).storage.canModifyItems;
  }

  _onDragEnter(event) {
    if (!this.#canModifyItems()) return;
    event.preventDefault();
    setDropZoneActive(event.currentTarget, true);
    this.#setDragoverState(true);
  }

  _onDragOver(event) {
    if (!this.#canModifyItems()) return;

    event.preventDefault();
    event.stopPropagation();
    applyCopyDropEffect(event);
    setDropZoneActive(event.currentTarget, true);
    this.#setDragoverState(true);
  }

  _onDragLeave(event) {
    const dropZone = event.currentTarget;
    if (!isDragLeavingDropZone(event, dropZone)) return;

    setDropZoneActive(dropZone, false);
    this.#setDragoverState(false);
  }

  async _onDropToStorage(event) {
    event.preventDefault();
    event.stopPropagation();

    setDropZoneActive(event.currentTarget, false);
    this.#setDragoverState(false);

    if (!this.#canModifyItems()) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.StorageLocked"));
      return;
    }

    const dragData = getStorageDragDataFromEvent(event);
    if (isStorageTransferDragData(dragData)) {
      return;
    }

    const item = await resolveDroppedItemDocument(dragData, event);
    if (!item) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.InvalidDrop"));
      return;
    }

    const result = await addItemToStorage(this.actor, this.slotId, item);

    switch (result.status) {
      case "stored":
      case "moved":
        await this.#queueRefresh();
        ui.notifications?.info(game.i18n.localize("ZUT.Storage.Notifications.ItemMovedToStorage"));
        return;

      case "copied":
        await this.#queueRefresh();
        ui.notifications?.info(game.i18n.localize("ZUT.Storage.Notifications.ItemCopiedToStorage"));
        return;

      case "alreadyStored":
        await this.#queueRefresh();
        ui.notifications?.info(game.i18n.localize("ZUT.Storage.Notifications.ItemAlreadyInStorage"));
        return;

      case "disabled":
        ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.StorageDisabled"));
        return;

      case "locked":
        ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.StorageLocked"));
        return;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.InvalidDrop"));
    }
  }

  async _onItemOpen(event, opener) {
    event.preventDefault();

    const itemId = opener.dataset.itemId;
    const item = await openStorageItemSheet(this.actor, itemId);

    if (!item) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.MissingItem"));
    }
  }

  async _onItemRemove(event, removeButton) {
    event.preventDefault();
    event.stopPropagation();

    const itemId = removeButton.dataset.itemId;
    const result = await removeStorageItem(this.actor, this.slotId, itemId);

    switch (result.status) {
      case "removed":
        await this.#queueRefresh();
        ui.notifications?.info(game.i18n.localize("ZUT.Storage.Notifications.ItemRemoved"));
        return;

      case "locked":
        ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.StorageLocked"));
        return;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.MissingItem"));
    }
  }

  async _onCapacityChange(event, capacityInput) {
    event.preventDefault();

    const result = await updateStorageSlotCapacity(this.actor, this.slotId, capacityInput.value);

    switch (result.status) {
      case "updated":
        await this.#queueRefresh();
        return;

      case "locked":
        ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.StorageLocked"));
        return;

      case "forbidden":
        ui.notifications?.warn(game.i18n.localize("ZUT.Storage.Notifications.TargetActorNotOwned"));
        return;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Errors.AutoSaveFailed"));
    }
  }

  _onItemDragStart(event, row) {
    const itemId = row.dataset.itemId;
    const item = this.actor?.items?.get(itemId);
    if (!item || !event.dataTransfer) return;

    const dragData = createStorageTransferDragData(item, this.slotId);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }
}

export function openStorageWindow(actor, slotId) {
  const app = new StorageWindow({ actor, slotId });
  app.render(true, { focus: true });
  return app;
}
