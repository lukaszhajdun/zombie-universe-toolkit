import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import {
  getClosestDropZoneId
} from "../services/dragdrop.service.js";
import {
  openActorReference
} from "../services/actor-ref.service.js";
import {
  addGroupMember,
  prepareGroupMembers,
  removeGroupMemberByIndex
} from "../services/group-actor.service.js";
import { getQualifiedActorType } from "../model/register-models.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";

const { FilePicker } = foundry.applications.apps;
const GROUP_TYPE = getQualifiedActorType(ACTOR_TYPES.GROUP);

export class GroupActorSheet extends BaseModuleActorSheet {
  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "zut-group-sheet"
    ]));

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 760 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-people-group"
      },
      { inplace: false }
    );

    delete options.window.controls;

    return options;
  }

  static get PARTS() {
    return {
      form: {
        template: `modules/${MODULE_ID}/templates/actors/group-sheet.hbs`
      }
    };
  }

  _getDropZoneIds() {
    return ["members"];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const members = await prepareGroupMembers(this.actor);

    return foundry.utils.mergeObject(
      context,
      {
        members,
        membersCount: members.length,
        hasMembers: members.length > 0
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
        selector: "[data-member-open]",
        handler: (event, element) => {
          void this._onMemberOpen(event, element);
        }
      },
      {
        selector: "[data-member-remove]",
        handler: (event, element) => {
          void this._onMemberRemove(event, element);
        }
      }
    ];
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

  async _onDropActor(event, actor) {
    const dropZoneId = getClosestDropZoneId(event);
    if (dropZoneId !== "members") return null;

    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Group.Members.Notifications.DropLocked"));
      return null;
    }

    const result = await addGroupMember(this.actor, actor);

    switch (result.status) {
      case "added":
        ui.notifications?.info(game.i18n.localize("ZUT.Group.Members.Notifications.Added"));
        return actor;

      case "duplicate":
        ui.notifications?.warn(game.i18n.localize("ZUT.Group.Members.Notifications.AlreadyAdded"));
        return null;

      case "self":
        ui.notifications?.warn(game.i18n.localize("ZUT.Group.Members.Notifications.CannotAddSelf"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Group.Members.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _onMemberOpen(event, button) {
    event.preventDefault();

    const index = Number(button.dataset.memberIndex);
    if (!Number.isInteger(index)) return;

    const member = this.actor.system.members?.[index];
    if (!member) return;

    const opened = await openActorReference(member);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Group.Members.Notifications.MissingActor"));
    }
  }

  async _onMemberRemove(event, button) {
    event.preventDefault();

    if (!this.canEditDocument) return;

    const index = Number(button.dataset.memberIndex);
    if (!Number.isInteger(index)) return;

    await removeGroupMemberByIndex(this.actor, index);
  }
}

let sheetRegistered = false;

export function registerGroupActorSheet() {
  if (sheetRegistered) return;

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, GroupActorSheet, {
    types: [GROUP_TYPE],
    makeDefault: true,
    label: game.i18n.localize("ZUT.Sheets.Group.Label")
  });

  sheetRegistered = true;
}
