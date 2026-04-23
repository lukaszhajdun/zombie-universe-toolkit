import { prepareRollDialog } from "../../../../systems/twdu/module/util/roll.js";

function createProxySheet(actor) {
  return {
    actor,
    object: actor,
    roll: null,
    lastTestName: "",
    lastDamage: 0
  };
}

function isActorBroken(actor) {
  if (!actor) return true;

  const health = actor.type === "animal"
    ? Number(actor.system?.healthMax?.value ?? 0)
    : Number(actor.system?.health?.value ?? 0);

  return health < 1;
}

export function openPartyRollDialog(rollData) {
  const actor = rollData?.actor;
  if (!actor) return false;

  if (isActorBroken(actor)) {
    ui.notifications?.warn(game.i18n.localize("twdu.ui.cantRollWhenBroken"));
    return false;
  }

  prepareRollDialog({
    type: rollData.type,
    sheet: createProxySheet(actor),
    actorType: actor.type,
    testName: rollData.testName,
    attName: rollData.attName ?? "",
    attributeDefault: rollData.attributeDefault ?? 0,
    skillKey: rollData.skillKey ?? "",
    skillName: rollData.skillName ?? "",
    skillDefault: rollData.skillDefault ?? 0,
    bonusDefault: 0,
    damageDefault: 0,
    armorItem: ""
  });

  return true;
}
