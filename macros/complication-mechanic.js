import { MODULE_ID } from "../scripts/core/constants.js";
import {
  COMPLICATION_CHARACTER,
  COMPLICATION_EFFECTS,
  COMPLICATION_SOURCES
} from "./complication-mechanic-data.js";

const MACRO_I18N_PREFIX = "ZUT.Macros.Complications";

const APOCALYPSE_STAGES = Object.freeze({
  early: Object.freeze({ thresholdBase: 20, characterDieMax: 1 }),
  full: Object.freeze({ thresholdBase: 30, characterDieMax: 2 }),
  late: Object.freeze({ thresholdBase: 40, characterDieMax: 3 })
});

const SCENE_RISK = Object.freeze({
  shelter: Object.freeze({ modifier: -10 }),
  standard: Object.freeze({ modifier: 0 }),
  danger: Object.freeze({ modifier: 10 })
});

const DEFAULT_STAGE_ID = "full";
const DEFAULT_RISK_ID = "standard";
const TESTING = false;

const UI_FLAGS = Object.freeze({
  showIntro: true,
  showProcedureNote: true,
  showPreview: true,
  showRollValuesOnChat: TESTING
});

function localize(key, fallback) {
  return game.i18n?.has?.(key) ? game.i18n.localize(key) : fallback;
}

function format(key, data, fallback) {
  return game.i18n?.has?.(key) ? game.i18n.format(key, data) : fallback;
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function resolveLanguage() {
  return game.i18n?.lang?.toLowerCase?.().startsWith("pl") ? "pl" : "en";
}

function localizeTableEntry(entry, lang = resolveLanguage()) {
  return entry?.[lang] ?? entry?.en ?? "";
}

function pickEntry(entries, rollTotal) {
  const index = Math.max(0, Math.min(entries.length - 1, Number(rollTotal) - 1));
  return entries[index];
}

function formatD100(total) {
  return Number(total) === 100 ? "100" : String(total).padStart(2, "0");
}

function getStageDef(stageId = DEFAULT_STAGE_ID) {
  return APOCALYPSE_STAGES[stageId] ?? APOCALYPSE_STAGES[DEFAULT_STAGE_ID];
}

function getRiskDef(riskId = DEFAULT_RISK_ID) {
  return SCENE_RISK[riskId] ?? SCENE_RISK[DEFAULT_RISK_ID];
}

function getFinalThreshold(stageId, riskId) {
  const stageDef = getStageDef(stageId);
  const riskDef = getRiskDef(riskId);
  return Math.min(50, Math.max(0, stageDef.thresholdBase + riskDef.modifier));
}

function getCharacterChance(stageId) {
  return getStageDef(stageId).characterDieMax * 10;
}

function buildStageOptions() {
  return Object.keys(APOCALYPSE_STAGES).map(stageId => ({
    id: stageId,
    label: localize(`${MACRO_I18N_PREFIX}.Stage.${stageId}.Label`, stageId),
    hint: localize(`${MACRO_I18N_PREFIX}.Stage.${stageId}.Hint`, "")
  }));
}

function buildRiskOptions() {
  return Object.keys(SCENE_RISK).map(riskId => ({
    id: riskId,
    label: localize(`${MACRO_I18N_PREFIX}.Risk.${riskId}.Label`, riskId),
    hint: localize(`${MACRO_I18N_PREFIX}.Risk.${riskId}.Hint`, "")
  }));
}

function buildChipOptionsHtml(name, options, selected) {
  return options.map(option => `
    <label class="zut-complication-option">
      <input
        type="radio"
        name="${escapeHtml(name)}"
        value="${escapeHtml(option.id)}"
        data-radio-group="${escapeHtml(name)}"
        ${option.id === selected ? "checked" : ""}
      />
      <span class="zut-complication-chip">${escapeHtml(option.label)}</span>
    </label>
  `).join("");
}

function buildDialogContent() {
  const stageOptions = buildStageOptions();
  const riskOptions = buildRiskOptions();
  const defaultStage = getStageDef(DEFAULT_STAGE_ID);
  const defaultRisk = getRiskDef(DEFAULT_RISK_ID);
  const defaultThreshold = getFinalThreshold(DEFAULT_STAGE_ID, DEFAULT_RISK_ID);
  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <style>
      .zut-complication-dialog .window-header {
        background: #111114;
        color: #f0e8d8;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }

      .zut-complication-dialog .window-title {
        color: #f0e8d8;
      }

      .zut-complication-dialog .window-content {
        padding: 10px 12px 6px 12px;
        background: #101115;
        color: #e7e2d8;
      }

      .zut-complication-wrap {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .zut-complication-title {
        margin: 2px 0 0 0;
        line-height: 1.2;
        font-size: 22px;
        font-weight: 700;
        text-align: center;
        color: #f1eadc;
      }

      .zut-complication-intro {
        margin: 0;
        line-height: 1.55;
        font-size: 14px;
        color: #d4ccbf;
        text-align: center;
      }

      .zut-complication-box {
        padding: 12px;
        background: #17181d;
        border: 1px solid rgba(255,255,255,0.10);
      }

      .zut-complication-label {
        display: block;
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #b9ae9b;
      }

      .zut-complication-option-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .zut-complication-option input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .zut-complication-chip {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 52px;
        padding: 8px 10px;
        text-align: center;
        font-weight: 700;
        line-height: 1.2;
        background: #262932;
        color: #f0e7d8;
        border: 1px solid rgba(255,255,255,0.14);
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
      }

      .zut-complication-option:hover .zut-complication-chip {
        background: #313540;
        border-color: rgba(255,255,255,0.22);
      }

      .zut-complication-option input:checked + .zut-complication-chip {
        color: #1a1a1a;
        background: #d8cfbf;
        border-color: #e6dccb;
      }

      .zut-complication-hint {
        margin-top: 10px;
        color: #d4ccbf;
        line-height: 1.45;
        font-size: 12px;
      }

      .zut-complication-preview {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .zut-complication-preview-card {
        padding: 12px;
        background: #22242b;
        border: 1px solid rgba(255,255,255,0.08);
      }

      .zut-complication-preview-value {
        margin-top: 6px;
        font-size: 22px;
        font-weight: 800;
        color: #f3ebdd;
      }

      .zut-complication-preview-meta {
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.45;
        color: #d4ccbf;
      }

      .zut-complication-note {
        padding: 10px 12px;
        background: rgba(216, 207, 191, 0.08);
        border-left: 3px solid #d8cfbf;
        color: #d8cfbf;
        font-size: 12px;
        line-height: 1.45;
      }

      .zut-complication-dialog .dialog-buttons,
      .zut-complication-dialog .form-footer,
      .zut-complication-dialog footer {
        display: flex;
        gap: 8px;
        padding: 8px;
        margin-bottom: 20px;
        border-top: 1px solid rgba(255,255,255,0.08);
        background: #121216;
      }

      .zut-complication-dialog .dialog-buttons button,
      .zut-complication-dialog .form-footer button,
      .zut-complication-dialog footer button {
        min-height: 42px;
        padding: 8px 12px;
        white-space: normal;
        border-radius: 0;
        border: 1px solid rgba(255,255,255,0.14);
        background: #262932;
        color: #f0e7d8;
        box-shadow: none;
      }

      .zut-complication-dialog .dialog-buttons button:hover,
      .zut-complication-dialog .form-footer button:hover,
      .zut-complication-dialog footer button:hover {
        background: #313540;
        border-color: rgba(255,255,255,0.22);
      }

      .zut-complication-dialog .dialog-buttons button[data-action="rollFull"],
      .zut-complication-dialog .form-footer button[data-action="rollFull"],
      .zut-complication-dialog footer button[data-action="rollFull"] {
        flex: 1 1 0;
      }

      @media (max-width: 700px) {
        .zut-complication-option-grid,
        .zut-complication-preview {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="zut-complication-wrap">
      <div class="zut-complication-title">${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Title`, "Complication Mechanic"))}</div>
      ${UI_FLAGS.showIntro ? `<div class="zut-complication-intro">${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Intro`, ""))}</div>` : ""}

      <div class="zut-complication-box">
        <label class="zut-complication-label">${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Labels.Stage`, "Apocalypse stage"))}</label>
        <div class="zut-complication-option-grid">
          ${buildChipOptionsHtml("stage", stageOptions, DEFAULT_STAGE_ID)}
        </div>
        <div class="zut-complication-hint" data-stage-hint>${escapeHtml(stageOptions.find(option => option.id === DEFAULT_STAGE_ID)?.hint ?? "")}</div>
      </div>

      <div class="zut-complication-box">
        <label class="zut-complication-label">${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Labels.Risk`, "Scene risk"))}</label>
        <div class="zut-complication-option-grid">
          ${buildChipOptionsHtml("risk", riskOptions, DEFAULT_RISK_ID)}
        </div>
        <div class="zut-complication-hint" data-risk-hint>${escapeHtml(riskOptions.find(option => option.id === DEFAULT_RISK_ID)?.hint ?? "")}</div>
      </div>

      ${UI_FLAGS.showPreview ? `
        <div class="zut-complication-preview">
          <div class="zut-complication-preview-card">
            <div class="zut-complication-label">${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Preview.Threshold`, "Complication threshold"))}</div>
            <div class="zut-complication-preview-value" data-threshold-value>${escapeHtml(String(defaultThreshold))}</div>
            <div class="zut-complication-preview-meta" data-threshold-meta>
              ${escapeHtml(format(`${MACRO_I18N_PREFIX}.Preview.ThresholdMeta`, {
                base: defaultStage.thresholdBase,
                modifier: defaultRisk.modifier >= 0 ? `+${defaultRisk.modifier}` : `${defaultRisk.modifier}`
              }, `Base ${defaultStage.thresholdBase}, modifier ${defaultRisk.modifier >= 0 ? `+${defaultRisk.modifier}` : defaultRisk.modifier}`))}
            </div>
          </div>

          <div class="zut-complication-preview-card">
            <div class="zut-complication-label">${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Preview.Character`, "Character chance"))}</div>
            <div class="zut-complication-preview-value" data-character-value>${escapeHtml(`${getCharacterChance(DEFAULT_STAGE_ID)}%`)}</div>
            <div class="zut-complication-preview-meta" data-character-meta>
              ${escapeHtml(format(`${MACRO_I18N_PREFIX}.Preview.CharacterMeta`, { max: defaultStage.characterDieMax }, `On d10: 1-${defaultStage.characterDieMax}`))}
            </div>
          </div>
        </div>
      ` : ""}

      ${UI_FLAGS.showProcedureNote ? `<div class="zut-complication-note">${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Note`, ""))}</div>` : ""}
    </div>
  `;

  return wrapper;
}

function getSelectedValue(rootEl, name, fallback) {
  return rootEl?.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

async function createChatMessage(content) {
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker(), content });
}

function buildOutcomeChip(label, value) {
  return `
    <div style="padding:10px 12px; background:#17181d; border:1px solid rgba(255,255,255,0.10);">
      <div style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#b9ae9b;">${escapeHtml(label)}</div>
      <div style="margin-top:6px; font-size:16px; font-weight:800; color:#f2eadc;">${escapeHtml(value)}</div>
    </div>
  `;
}

function buildRollMetaLine(label, value) {
  return `
    <div style="font-size:11px; letter-spacing:0.04em; text-transform:uppercase; color:#948a7c;">
      ${escapeHtml(label)}: ${escapeHtml(value)}
    </div>
  `;
}

function buildFullChatCard(result) {
  const rollMeta = UI_FLAGS.showRollValuesOnChat ? [
    buildRollMetaLine(localize(`${MACRO_I18N_PREFIX}.Chat.TestRoll`, "Test roll"), formatD100(result.testRoll)),
    buildRollMetaLine(localize(`${MACRO_I18N_PREFIX}.Chat.Threshold`, "Threshold"), String(result.threshold)),
    buildRollMetaLine(localize(`${MACRO_I18N_PREFIX}.Chat.Stage`, "Stage"), result.stageLabel),
    buildRollMetaLine(localize(`${MACRO_I18N_PREFIX}.Chat.Risk`, "Risk"), result.riskLabel)
  ].join("") : "";

  const headerBadgeLabel = result.success
    ? localize(`${MACRO_I18N_PREFIX}.Chat.Badge.Complication`, "Complication")
    : localize(`${MACRO_I18N_PREFIX}.Chat.Badge.NoComplication`, "No complication");

  const description = result.success
    ? localize(`${MACRO_I18N_PREFIX}.Chat.SuccessText`, "Something in this scene turns against the group. The world shifts just enough to make the next step harder, meaner, or more costly.")
    : localize(`${MACRO_I18N_PREFIX}.Chat.FailureText`, "For now, the world holds its breath. No new complication rises out of this scene, but that kind of peace never lasts for long.");

  const outcomeGrid = result.success ? `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-top:12px;">
      ${buildOutcomeChip(localize(`${MACRO_I18N_PREFIX}.Chat.Source`, "Source"), `${result.source}${UI_FLAGS.showRollValuesOnChat ? ` (${formatD100(result.sourceRoll)})` : ""}`)}
      ${buildOutcomeChip(localize(`${MACRO_I18N_PREFIX}.Chat.Effect`, "Effect"), `${result.effect}${UI_FLAGS.showRollValuesOnChat ? ` (${formatD100(result.effectRoll)})` : ""}`)}
      ${buildOutcomeChip(localize(`${MACRO_I18N_PREFIX}.Chat.Character`, "Character"), result.character ? `${result.character}${UI_FLAGS.showRollValuesOnChat ? ` (${result.characterRoll})` : ""}` : localize(`${MACRO_I18N_PREFIX}.Chat.NoCharacter`, "None"))}
    </div>
    ${UI_FLAGS.showRollValuesOnChat ? `<div style="margin-top:10px;">${buildRollMetaLine(localize(`${MACRO_I18N_PREFIX}.Chat.CharacterTest`, "Character test"), String(result.characterTestRoll))}</div>` : ""}
  ` : "";

  return `
    <section style="margin:0; padding:0; background:#111114; border:1px solid rgba(255,255,255,0.12); color:#eae2d6;">
      <div style="padding:14px;">
        ${rollMeta ? `<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:10px;">${rollMeta}</div>` : ""}
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#bcae97;">
            ${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Title`, "Complication Mechanic"))}
          </div>
          <div style="padding:7px 10px; border:1px solid rgba(255,255,255,0.14); background:#262932; color:#f0e7d8; font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase;">
            ${escapeHtml(headerBadgeLabel)}
          </div>
        </div>
        <div style="margin-top:12px; padding:12px 14px; background:#17181d; border-left:3px solid #d8cfbf; color:#e7e2d8; line-height:1.6;">
          ${escapeHtml(description)}
        </div>
        ${outcomeGrid}
      </div>
    </section>
  `;
}

function buildSingleTableCard({ title, entryLabel, rollTotal, dieLabel }) {
  const rollMeta = UI_FLAGS.showRollValuesOnChat ? `
    <div style="margin-bottom:10px; font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#bcae97;">
      ${escapeHtml(localize(`${MACRO_I18N_PREFIX}.Chat.Roll`, "Roll"))}: ${escapeHtml(String(rollTotal))} (${escapeHtml(dieLabel)})
    </div>
  ` : "";

  return `
    <section style="margin:0; padding:0; background:#111114; border:1px solid rgba(255,255,255,0.12); color:#eae2d6;">
      <div style="padding:14px;">
        ${rollMeta}
        <div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#bcae97;">
          ${escapeHtml(title)}
        </div>
        <div style="margin-top:12px; padding:14px; background:#17181d; border-left:3px solid #d8cfbf; color:#e7e2d8; line-height:1.6; font-size:18px; font-weight:800;">
          ${escapeHtml(entryLabel)}
        </div>
      </div>
    </section>
  `;
}

async function rollSingleTable(entries, titleKey, dieFormula, formatter = String) {
  const lang = resolveLanguage();
  const roll = await (new Roll(dieFormula)).evaluate();
  const total = Number(roll.total);
  const entry = pickEntry(entries, total);

  await createChatMessage(buildSingleTableCard({
    title: localize(titleKey, titleKey),
    entryLabel: localizeTableEntry(entry, lang),
    rollTotal: formatter(total),
    dieLabel: dieFormula
  }));
}

async function rollFullComplication({ stageId, riskId }) {
  const lang = resolveLanguage();
  const threshold = getFinalThreshold(stageId, riskId);
  const stageLabel = localize(`${MACRO_I18N_PREFIX}.Stage.${stageId}.Label`, stageId);
  const riskLabel = localize(`${MACRO_I18N_PREFIX}.Risk.${riskId}.Label`, riskId);
  const testRoll = await (new Roll("1d100")).evaluate();
  const result = {
    stageLabel,
    riskLabel,
    threshold,
    testRoll: Number(testRoll.total),
    success: Number(testRoll.total) <= threshold,
    source: null,
    sourceRoll: null,
    effect: null,
    effectRoll: null,
    character: null,
    characterRoll: null,
    characterTestRoll: null
  };

  if (result.success) {
    const sourceRoll = await (new Roll("1d100")).evaluate();
    const effectRoll = await (new Roll("1d100")).evaluate();
    result.sourceRoll = Number(sourceRoll.total);
    result.effectRoll = Number(effectRoll.total);
    result.source = localizeTableEntry(pickEntry(COMPLICATION_SOURCES, result.sourceRoll), lang);
    result.effect = localizeTableEntry(pickEntry(COMPLICATION_EFFECTS, result.effectRoll), lang);

    const characterTestRoll = await (new Roll("1d10")).evaluate();
    result.characterTestRoll = Number(characterTestRoll.total);

    if (result.characterTestRoll <= getStageDef(stageId).characterDieMax) {
      const characterRoll = await (new Roll("1d20")).evaluate();
      result.characterRoll = Number(characterRoll.total);
      result.character = localizeTableEntry(pickEntry(COMPLICATION_CHARACTER, result.characterRoll), lang);
    }
  }

  await createChatMessage(buildFullChatCard(result));
}

function updatePreview(rootEl) {
  const stageId = getSelectedValue(rootEl, "stage", DEFAULT_STAGE_ID);
  const riskId = getSelectedValue(rootEl, "risk", DEFAULT_RISK_ID);
  const threshold = getFinalThreshold(stageId, riskId);
  const stageDef = getStageDef(stageId);
  const riskDef = getRiskDef(riskId);

  const stageHintEl = rootEl.querySelector("[data-stage-hint]");
  const riskHintEl = rootEl.querySelector("[data-risk-hint]");
  const thresholdValueEl = rootEl.querySelector("[data-threshold-value]");
  const thresholdMetaEl = rootEl.querySelector("[data-threshold-meta]");
  const characterValueEl = rootEl.querySelector("[data-character-value]");
  const characterMetaEl = rootEl.querySelector("[data-character-meta]");

  if (stageHintEl) stageHintEl.textContent = buildStageOptions().find(option => option.id === stageId)?.hint ?? "";
  if (riskHintEl) riskHintEl.textContent = buildRiskOptions().find(option => option.id === riskId)?.hint ?? "";
  if (thresholdValueEl) thresholdValueEl.textContent = String(threshold);

  if (thresholdMetaEl) {
    const modifierLabel = riskDef.modifier >= 0 ? `+${riskDef.modifier}` : `${riskDef.modifier}`;
    thresholdMetaEl.textContent = format(`${MACRO_I18N_PREFIX}.Preview.ThresholdMeta`, {
      base: stageDef.thresholdBase,
      modifier: modifierLabel
    }, `Base ${stageDef.thresholdBase}, modifier ${modifierLabel}`);
  }

  if (characterValueEl) characterValueEl.textContent = `${getCharacterChance(stageId)}%`;

  if (characterMetaEl) {
    characterMetaEl.textContent = format(`${MACRO_I18N_PREFIX}.Preview.CharacterMeta`, {
      max: stageDef.characterDieMax
    }, `On d10: 1-${stageDef.characterDieMax}`);
  }
}

export async function runComplicationMechanicMacro() {
  if (!foundry?.applications?.api?.DialogV2) {
    ui.notifications?.error(localize(`${MACRO_I18N_PREFIX}.Errors.DialogUnavailable`, "DialogV2 is not available in this Foundry version."));
    return;
  }

  if (COMPLICATION_SOURCES.length !== 100 || COMPLICATION_EFFECTS.length !== 100 || COMPLICATION_CHARACTER.length !== 20) {
    ui.notifications?.error(localize(`${MACRO_I18N_PREFIX}.Errors.InvalidTableLengths`, "Complication tables have invalid lengths."));
    return;
  }

  const dialog = new foundry.applications.api.DialogV2({
    window: {
      title: localize(`${MACRO_I18N_PREFIX}.Title`, "Complication Mechanic"),
      resizable: false
    },
    classes: [`${MODULE_ID}-complication-dialog`, "zut-complication-dialog"],
    position: { width: 620, height: "auto" },
    content: buildDialogContent(),
    modal: false,
    form: { closeOnSubmit: false },
    buttons: [
      {
        action: "rollFull",
        label: localize(`${MACRO_I18N_PREFIX}.Buttons.RollFull`, "Roll complication"),
        default: true,
        callback: async (_event, _button, dialogApp) => {
          await rollFullComplication({
            stageId: getSelectedValue(dialogApp.element, "stage", DEFAULT_STAGE_ID),
            riskId: getSelectedValue(dialogApp.element, "risk", DEFAULT_RISK_ID)
          });
          return "rollFull";
        }
      },
      {
        action: "rollSource",
        label: localize(`${MACRO_I18N_PREFIX}.Buttons.RollSource`, "Roll source"),
        callback: async () => {
          await rollSingleTable(COMPLICATION_SOURCES, `${MACRO_I18N_PREFIX}.Chat.Source`, "1d100", formatD100);
          return "rollSource";
        }
      },
      {
        action: "rollEffect",
        label: localize(`${MACRO_I18N_PREFIX}.Buttons.RollEffect`, "Roll effect"),
        callback: async () => {
          await rollSingleTable(COMPLICATION_EFFECTS, `${MACRO_I18N_PREFIX}.Chat.Effect`, "1d100", formatD100);
          return "rollEffect";
        }
      },
      {
        action: "rollCharacter",
        label: localize(`${MACRO_I18N_PREFIX}.Buttons.RollCharacter`, "Roll character"),
        callback: async () => {
          await rollSingleTable(COMPLICATION_CHARACTER, `${MACRO_I18N_PREFIX}.Chat.Character`, "1d20");
          return "rollCharacter";
        }
      },
      {
        action: "close",
        label: localize(`${MACRO_I18N_PREFIX}.Buttons.Close`, "Close"),
        callback: async (_event, _button, dialogApp) => {
          await dialogApp.close();
          return "close";
        }
      }
    ]
  });

  await dialog.render({ force: true });

  const rootEl = dialog.element;
  if (!rootEl) return;

  const resizeToContent = () => {
    requestAnimationFrame(() => {
      if (!dialog.rendered) return;
      dialog.setPosition({ height: "auto" });
    });
  };

  for (const radio of rootEl.querySelectorAll("[data-radio-group]")) {
    radio.addEventListener("change", () => {
      updatePreview(rootEl);
      resizeToContent();
    });
  }

  updatePreview(rootEl);
  resizeToContent();
}

export default runComplicationMechanicMacro;
