import {
  ACTOR_TYPES,
  MODULE_ID
} from "../core/constants.js";
import { getQualifiedActorType } from "../model/register-models.js";
import { getClosestDropZoneId } from "../services/dragdrop.service.js";
import { openActorReference } from "../services/actor-ref.service.js";
import {
  addFactionChallenge,
  addFactionHaven,
  addFactionKeyFigure,
  prepareFactionChallenges,
  prepareFactionHavens,
  prepareFactionKeyFigures,
  removeFactionChallengeByIndex,
  removeFactionHavenByIndex,
  removeFactionKeyFigureByIndex
} from "../services/faction-actor.service.js";
import { BaseModuleActorSheet } from "./base-module-actor-sheet.js";

const FACTION_TYPE = getQualifiedActorType(ACTOR_TYPES.FACTION);

export class FactionActorSheet extends BaseModuleActorSheet {
  static get DEFAULT_OPTIONS() {
    const options = foundry.utils.deepClone(super.DEFAULT_OPTIONS);

    options.classes = Array.from(new Set([
      ...(options.classes ?? []),
      "zut-faction-sheet"
    ]));

    options.position = foundry.utils.mergeObject(
      options.position ?? {},
      { width: 960 },
      { inplace: false }
    );

    options.window = foundry.utils.mergeObject(
      options.window ?? {},
      {
        icon: "fa-solid fa-flag"
      },
      { inplace: false }
    );

    delete options.window.controls;

    return options;
  }

  static get PARTS() {
    return {
      form: {
        template: `modules/${MODULE_ID}/templates/actors/faction-sheet.hbs`
      }
    };
  }

  _getDropZoneIds() {
    return ["keyFigures", "havens", "challenges"];
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const [keyFigures, havens, challenges] = await Promise.all([
      prepareFactionKeyFigures(this.actor),
      prepareFactionHavens(this.actor),
      prepareFactionChallenges(this.actor)
    ]);

    return foundry.utils.mergeObject(
      context,
      {
        keyFigures,
        hasKeyFigures: keyFigures.length > 0,
        keyFiguresCount: keyFigures.length,
        havens,
        hasHavens: havens.length > 0,
        havensCount: havens.length,
        challenges,
        hasChallenges: challenges.length > 0,
        challengesCount: challenges.length
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
        selector: "[data-key-figure-open]",
        handler: (_event, element) => {
          void this._onKeyFigureOpen(element);
        }
      },
      {
        selector: "[data-key-figure-remove]",
        handler: (_event, element) => {
          void this._onKeyFigureRemove(element);
        }
      },
      {
        selector: "[data-haven-open]",
        handler: (_event, element) => {
          void this._onHavenOpen(element);
        }
      },
      {
        selector: "[data-haven-remove]",
        handler: (_event, element) => {
          void this._onHavenRemove(element);
        }
      },
      {
        selector: "[data-challenge-open]",
        handler: (_event, element) => {
          void this._onChallengeOpen(element);
        }
      },
      {
        selector: "[data-challenge-remove]",
        handler: (_event, element) => {
          void this._onChallengeRemove(element);
        }
      }
    ];
  }

  async _onDropActor(event, actor) {
    const dropZoneId = getClosestDropZoneId(event);
    if (!dropZoneId) return null;

    if (!this.canEditDocument) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Faction.Notifications.DropLocked"));
      return null;
    }

    let result = null;

    switch (dropZoneId) {
      case "keyFigures":
        result = await addFactionKeyFigure(this.actor, actor);
        break;
      case "havens":
        result = await addFactionHaven(this.actor, actor);
        break;
      case "challenges":
        result = await addFactionChallenge(this.actor, actor);
        break;
      default:
        return null;
    }

    switch (result?.status) {
      case "added":
        ui.notifications?.info(game.i18n.localize("ZUT.Faction.Notifications.Added"));
        return actor;
      case "duplicate":
        ui.notifications?.warn(game.i18n.localize("ZUT.Faction.Notifications.AlreadyAdded"));
        return null;
      case "self":
        ui.notifications?.warn(game.i18n.localize("ZUT.Faction.Notifications.CannotAddSelf"));
        return null;
      default:
        ui.notifications?.warn(game.i18n.localize("ZUT.Faction.Notifications.InvalidDrop"));
        return null;
    }
  }

  async _onKeyFigureOpen(button) {
    const index = Number(button.dataset.keyFigureIndex);
    if (!Number.isInteger(index)) return;

    const entry = this.actor.system.keyFigures?.[index];
    const opened = await openActorReference(entry?.actor);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Faction.Notifications.MissingActor"));
    }
  }

  async _onKeyFigureRemove(button) {
    if (!this.canEditDocument) return;

    const index = Number(button.dataset.keyFigureIndex);
    if (!Number.isInteger(index)) return;

    await removeFactionKeyFigureByIndex(this.actor, index);
  }

  async _onHavenOpen(button) {
    const index = Number(button.dataset.havenIndex);
    if (!Number.isInteger(index)) return;

    const entry = this.actor.system.havens?.[index];
    const opened = await openActorReference(entry);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Faction.Notifications.MissingActor"));
    }
  }

  async _onHavenRemove(button) {
    if (!this.canEditDocument) return;

    const index = Number(button.dataset.havenIndex);
    if (!Number.isInteger(index)) return;

    await removeFactionHavenByIndex(this.actor, index);
  }

  async _onChallengeOpen(button) {
    const index = Number(button.dataset.challengeIndex);
    if (!Number.isInteger(index)) return;

    const entry = this.actor.system.challenges?.[index];
    const opened = await openActorReference(entry);
    if (!opened) {
      ui.notifications?.warn(game.i18n.localize("ZUT.Faction.Notifications.MissingActor"));
    }
  }

  async _onChallengeRemove(button) {
    if (!this.canEditDocument) return;

    const index = Number(button.dataset.challengeIndex);
    if (!Number.isInteger(index)) return;

    await removeFactionChallengeByIndex(this.actor, index);
  }
}

let sheetRegistered = false;

export function registerFactionActorSheet() {
  if (sheetRegistered) return;

  foundry.documents.collections.Actors.registerSheet(MODULE_ID, FactionActorSheet, {
    types: [FACTION_TYPE],
    makeDefault: true,
    label: game.i18n.localize("ZUT.Sheets.Faction.Label")
  });

  sheetRegistered = true;
}
