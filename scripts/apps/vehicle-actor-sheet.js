import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import { STORAGE_SLOT_IDS } from "../data/storage-slot-config.js";
import { getQualifiedActorType } from "../model/register-models.js";
import {
  beginActorRoleTransferDragFromElement,
  getActorRoleTransferDataFromEvent,
  getActorRoleTransferTargetFromEvent,
  isActorRoleTransferEventForHost
} from "../services/actor-role-transfer.service.js";
import { getClosestDropZoneId } from "../services/dragdrop.service.js";
import { openActorReference } from "../services/actor-ref.service.js";
import {
  addVehiclePassenger,
  assignVehicleDriver,
  assignVehicleOwner,
  clearVehicleDriver,
  clearVehicleOwner,
  getVehicleDriverReference,
  getVehicleOccupancyCount,
  getVehicleOwnerReference,
  getVehiclePassengerCapacity,
  prepareVehicleDriver,
  prepareVehicleOwner,
  prepareVehiclePassengers,
  removeVehiclePassengerByIndex
} from "../services/vehicle-actor.service.js";
import { transferVehicleActorRole } from "../services/vehicle-role-transfer.service.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";
import { openStorageWindow } from "./storage-window.js";

const { FilePicker } = foundry.applications.apps;
const VEHICLE_TYPE = getQualifiedActorType(ACTOR_TYPES.VEHICLE);

export class VehicleActorSheet extends BaseModuleActorSheet {
  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "zut-vehicle-sheet"
    ]));

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 960 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-car-side"
      },
      { inplace: false }
    );

    delete options.window.controls;

    return options;
  }

  static get PARTS() {
    return {
      form: {
        template: `modules/${MODULE_ID}/templates/actors/vehicle-sheet.hbs`
      }
    };
  }

  _getDropZoneIds() {
    return ["owner", "driver", "passengers"];
  }

  _getDropZoneDropEffect(_dropZoneId, event) {
    return isActorRoleTransferEventForHost(event, this.actor) ? "move" : "copy";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const [ownerData, driverData, passengers] = await Promise.all([
      prepareVehicleOwner(this.actor),
      prepareVehicleDriver(this.actor),
      prepareVehiclePassengers(this.actor)
    ]);

    const passengerCapacity = getVehiclePassengerCapacity(this.actor);
    const passengersCount = passengers.length;
    const occupancyCount = getVehicleOccupancyCount(this.actor);
    const isTrunkEnabled = this.actor?.system?.storage?.trunk?.enabled !== false;

    return foundry.utils.mergeObject(
      context,
      {
        ownerData,
        hasOwner: Boolean(ownerData),
        driverData,
        hasDriver: Boolean(driverData),
        passengers,
        hasPassengers: passengersCount > 0,
        passengersCount,
        passengerCapacity,
        occupancyCount,
        isTrunkEnabled
      },
      { inplace: false }
    );
  }

  _getSheetClickActionMap() {
    return [
      {
        selector: "[data-edit-image]",
        handler: event => {
          void this._onPortraitEdit(event);
        }
      },
      {
        selector: "[data-owner-clear]",
        handler: event => {
          void this._onOwnerClear(event);
        }
      },
      {
        selector: "[data-owner-open]",
        handler: event => {
          void this._onOwnerOpen(event);
        }
      },
      {
        selector: "[data-driver-clear]",
        handler: event => {
          void this._onDriverClear(event);
        }
      },
      {
        selector: "[data-driver-open]",
        handler: event => {
          void this._onDriverOpen(event);
        }
      },
      {
        selector: "[data-passenger-remove]",
        handler: (event, element) => {
          void this._onPassengerRemove(event, element);
        }
      },
      {
        selector: "[data-passenger-open]",
        handler: (event, element) => {
          void this._onPassengerOpen(event, element);
        }
      },
      {
        selector: "[data-open-trunk]",
        handler: event => {
          void this._onOpenTrunk(event);
        }
      }
    ];
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

  async _onDelegatedDragStart(event, dragSource) {
    const dragData = beginActorRoleTransferDragFromElement(event, this.actor, dragSource);
    if (!dragData) return false;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }

    return true;
  }

  async _onDropActor(event, actor) {
    const transferData = getActorRoleTransferDataFromEvent(event);

    if (transferData && isActorRoleTransferEventForHost(event, this.actor)) {
      let draggedActor = actor;
      if (draggedActor?.documentName !== "Actor" && transferData.actorUuid) {
        try {
          const resolved = await fromUuid(transferData.actorUuid);
          draggedActor = resolved?.documentName === "Actor" ? resolved : null;
        } catch (_error) {
          draggedActor = null;
        }
      }

      if (draggedActor?.documentName !== "Actor") {
        ui.notifications?.warn("ZUT internal drop failed: could not resolve dragged actor.");
        return null;
      }

      const target = getActorRoleTransferTargetFromEvent(event);
      if (!target) {
        ui.notifications?.warn("ZUT internal drop failed: could not resolve drop target.");
        return null;
      }

      return this._handleInternalRoleTransfer(draggedActor, transferData, target);
    }

    const dropZoneId = getClosestDropZoneId(event);

    switch (dropZoneId) {
      case "owner":
        return this._handleOwnerDrop(actor);

      case "driver":
        return this._handleDriverDrop(actor);

      case "passengers":
        return this._handlePassengerDrop(actor);

      default:
        return null;
    }
  }

  async _handleInternalRoleTransfer(draggedActor, transferData, target) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.DropLocked"));
      return null;
    }

    const result = await transferVehicleActorRole(this.actor, draggedActor, transferData, target);

    switch (result.status) {
      case "assigned":
      case "swapped":
        if (target.targetRole === "driver") {
          ui.notifications?.info(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.Assigned"));
        }
        return draggedActor;

      case "ownerAssigned":
        ui.notifications?.info(game.i18n.localize("ZUT.Vehicle.Owner.Notifications.Assigned"));
        return draggedActor;

      case "movedToPassengers":
      case "reordered":
      case "noop":
        return draggedActor;

      case "invalidSourceActor":
        ui.notifications?.warn("ZUT internal drop failed: source actor does not match stored role reference.");
        return null;

      case "missingSource":
        ui.notifications?.warn("ZUT internal drop failed: missing source role data.");
        return null;

      case "missingTarget":
        ui.notifications?.warn("ZUT internal drop failed: missing target role data.");
        return null;

      case "invalidTarget":
        ui.notifications?.warn("ZUT internal drop failed: transfer to this target is not allowed.");
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.InvalidDrop"));
        return null;
    }
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

  async _handleOwnerDrop(actor) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Owner.Notifications.DropLocked"));
      return null;
    }

    const result = await assignVehicleOwner(this.actor, actor);

    switch (result.status) {
      case "assigned":
        ui.notifications?.info(game.i18n.localize("ZUT.Vehicle.Owner.Notifications.Assigned"));
        return actor;

      case "invalidType":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Owner.Notifications.InvalidType"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Owner.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _handleDriverDrop(actor) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.DropLocked"));
      return null;
    }

    const result = await assignVehicleDriver(this.actor, actor);

    switch (result.status) {
      case "assigned":
        ui.notifications?.info(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.Assigned"));
        return actor;

      case "alreadyDriver":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.AlreadyAssigned"));
        return null;

      case "alreadyPassenger":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.AlreadyPassenger"));
        return null;

      case "occupied":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.Occupied"));
        return null;

      case "invalidType":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.InvalidType"));
        return null;

      case "full":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.Full"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _handlePassengerDrop(actor) {
    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.DropLocked"));
      return null;
    }

    const result = await addVehiclePassenger(this.actor, actor);

    switch (result.status) {
      case "added":
        ui.notifications?.info(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.Added"));
        return actor;

      case "groupAdded":
        ui.notifications?.info(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.GroupAdded"));
        return actor;

      case "duplicate":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.AlreadyAdded"));
        return null;

      case "driverDuplicate":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.AlreadyDriver"));
        return null;

      case "groupNoEligible":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.GroupNoEligible"));
        return null;

      case "invalidType":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.InvalidType"));
        return null;

      case "full":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.Full"));
        return null;

      case "groupFull":
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.GroupFull"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _onOwnerOpen(event) {
    event.preventDefault();

    const ownerReference = getVehicleOwnerReference(this.actor);
    if (!ownerReference) return;

    const opened = await openActorReference(ownerReference);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Owner.Notifications.MissingActor"));
    }
  }

  async _onOwnerClear(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    await clearVehicleOwner(this.actor);
  }

  async _onDriverOpen(event) {
    event.preventDefault();

    const driverReference = getVehicleDriverReference(this.actor);
    if (!driverReference) return;

    const opened = await openActorReference(driverReference);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Driver.Notifications.MissingActor"));
    }
  }

  async _onDriverClear(event) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    await clearVehicleDriver(this.actor);
  }

  async _onPassengerOpen(event, opener) {
    event.preventDefault();

    const index = Number(opener.dataset.passengerIndex);
    if (!Number.isInteger(index)) return;

    const passenger = this.actor.system.passengers?.[index];
    if (!passenger) return;

    const opened = await openActorReference(passenger);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Vehicle.Passengers.Notifications.MissingActor"));
    }
  }

  async _onPassengerRemove(event, removeButton) {
    event.preventDefault();
    if (!this.canEditDocument) return;

    const index = Number(removeButton.dataset.passengerIndex);
    if (!Number.isInteger(index)) return;

    await removeVehiclePassengerByIndex(this.actor, index);
  }

  async _onOpenTrunk(event) {
    event.preventDefault();

    if (this.actor?.system?.storage?.trunk?.enabled === false) return;
    openStorageWindow(this.actor, STORAGE_SLOT_IDS.TRUNK);
  }
}

let sheetRegistered = false;

export function registerVehicleActorSheet() {
  if (sheetRegistered) return;

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, VehicleActorSheet, {
    types: [VEHICLE_TYPE],
    makeDefault: true,
    label: game.i18n.localize("ZUT.Sheets.Vehicle.Label")
  });

  sheetRegistered = true;
}
