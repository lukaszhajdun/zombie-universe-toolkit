import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import { getQualifiedActorType } from "../model/register-models.js";
import { getClosestDropZoneId } from "../services/dragdrop.service.js";
import { openActorReference } from "../services/actor-ref.service.js";
import {
  addPartyMember,
  preparePartyMembers,
  removePartyMemberByIndex
} from "../services/party-actor.service.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";

const PARTY_TYPE = getQualifiedActorType(ACTOR_TYPES.PARTY);

export class PartyActorSheet extends BaseModuleActorSheet {
  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "zut-party-sheet"
    ]));

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 760 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-user-group"
      },
      { inplace: false }
    );

    delete options.window.controls;

    return options;
  }

  static get PARTS() {
    return {
      form: {
        template: `modules/${MODULE_ID}/templates/actors/party-sheet.hbs`
      }
    };
  }

  _getDropZoneIds() {
    return ["members"];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const members = await preparePartyMembers(this.actor);

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

  async _onDropActor(event, actor) {
    const dropZoneId = getClosestDropZoneId(event);
    if (dropZoneId !== "members") return null;

    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Party.Members.Notifications.DropLocked"));
      return null;
    }

    const result = await addPartyMember(this.actor, actor);

    switch (result.status) {
      case "added":
        ui.notifications?.info(game.i18n.localize("ZUT.Party.Members.Notifications.Added"));
        return actor;

      case "duplicate":
        ui.notifications?.warn(game.i18n.localize("ZUT.Party.Members.Notifications.AlreadyAdded"));
        return null;

      case "self":
        ui.notifications?.warn(game.i18n.localize("ZUT.Party.Members.Notifications.CannotAddSelf"));
        return null;

      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Party.Members.Notifications.InvalidDrop"));
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
      ui.notifications?.warn(game.i18n.localize("ZUT.Party.Members.Notifications.MissingActor"));
    }
  }

  async _onMemberRemove(event, button) {
    event.preventDefault();

    if (!this.canEditDocument) return;

    const index = Number(button.dataset.memberIndex);
    if (!Number.isInteger(index)) return;

    await removePartyMemberByIndex(this.actor, index);
  }
}

let sheetRegistered = false;

export function registerPartyActorSheet() {
  if (sheetRegistered) return;

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, PartyActorSheet, {
    types: [PARTY_TYPE],
    makeDefault: true,
    label: game.i18n.localize("ZUT.Sheets.Party.Label")
  });

  sheetRegistered = true;
}
