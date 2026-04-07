import {
  ACTOR_TYPES,
  qualifyModuleActorType
} from "../scripts/core/constants.js";
import { importTwduVehicleItemToModuleVehicle } from "../scripts/services/twdu-vehicle-integration.service.js";
import {
  assignVehicleDriver,
  assignVehicleOwner
} from "../scripts/services/vehicle-actor.service.js";

const DEFAULT_TARGET_FOLDER_NAME = "Vehicles Import";

function localize(key, fallback) {
  return game.i18n?.has?.(key) ? game.i18n.localize(key) : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeCollection(collectionLike) {
  if (!collectionLike) return [];
  if (Array.isArray(collectionLike)) return collectionLike;
  if (Array.isArray(collectionLike.contents)) return collectionLike.contents;
  return Array.from(collectionLike);
}

function getFolderPathLabel(folder) {
  if (!folder) return "";

  const names = [folder.name ?? ""];
  let parentId = folder.folder ?? folder._source?.folder ?? null;

  while (parentId) {
    const parent = game.folders?.get?.(parentId) ?? null;
    if (!parent) break;
    names.unshift(parent.name ?? "");
    parentId = parent.folder ?? parent._source?.folder ?? null;
  }

  return names.filter(Boolean).join(" / ");
}

function getActorPathLabel(actor) {
  const folderLabel = actor.folder ? getFolderPathLabel(actor.folder) : "";
  return folderLabel ? `${folderLabel} / ${actor.name}` : actor.name;
}

function getVehicleActorTypes() {
  return new Set([
    ACTOR_TYPES.VEHICLE,
    qualifyModuleActorType(ACTOR_TYPES.VEHICLE)
  ]);
}

function isVehicleActorNameTaken(name) {
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName.length) return false;

  const vehicleActorTypes = getVehicleActorTypes();
  return (game.actors ?? []).some(actor =>
    vehicleActorTypes.has(actor.type) && actor.name === normalizedName
  );
}

function getSourceActorOptions() {
  return normalizeCollection(game.actors)
    .filter(actor => actor?.documentName === "Actor")
    .filter(actor => actor.items?.some?.(item => item.type === "vehicle"))
    .map(actor => ({
      id: actor.id,
      label: getActorPathLabel(actor),
      vehicleCount: actor.items.filter(item => item.type === "vehicle").length
    }))
    .sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang));
}

function getActorFolderOptions() {
  const folders = normalizeCollection(game.folders)
    .filter(folder => folder?.type === "Actor")
    .map(folder => ({
      id: folder.id,
      label: getFolderPathLabel(folder)
    }));

  return folders.sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang));
}

function buildOptionsHtml(options, { selected = "", blankLabel = "" } = {}) {
  const entries = [];

  if (blankLabel) {
    entries.push(`<option value="">${escapeHtml(blankLabel)}</option>`);
  }

  for (const option of options) {
    const isSelected = option.id === selected ? " selected" : "";
    entries.push(`<option value="${escapeHtml(option.id)}"${isSelected}>${escapeHtml(option.label)}</option>`);
  }

  return entries.join("");
}

function buildDialogContent({
  sourceActors,
  actorFolders,
  selectedActorId = "",
  targetMode = "existing",
  selectedActorFolderId = "",
  newActorFolderName = ""
}) {
  return `
    <form class="zut-macro-form">
      <div class="form-group">
        <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActorsFromActorItems.SourceActor", "Source actor"))}</label>
        <select name="sourceActorId">
          ${buildOptionsHtml(sourceActors, {
            selected: selectedActorId,
            blankLabel: sourceActors.length ? "-- Select actor --" : "-- No actors with vehicle items found --"
          })}
        </select>
      </div>

      <hr>

      <div class="form-group">
        <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActors.TargetMode", "Target actor folder mode"))}</label>
        <select name="targetMode">
          <option value="existing"${targetMode === "existing" ? " selected" : ""}>Use existing actor folder</option>
          <option value="new"${targetMode === "new" ? " selected" : ""}>Create or use folder by name</option>
        </select>
      </div>

      <div class="form-group" data-target-panel="existing"${targetMode === "existing" ? "" : " hidden"}>
        <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActors.TargetExistingFolder", "Existing actor folder"))}</label>
        <select name="actorFolderId">
          ${buildOptionsHtml(actorFolders, {
            selected: selectedActorFolderId,
            blankLabel: "-- Root / no folder --"
          })}
        </select>
      </div>

      <div class="form-group" data-target-panel="new"${targetMode === "new" ? "" : " hidden"}>
        <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActors.TargetNewFolder", "New actor folder name"))}</label>
        <input type="text" name="newActorFolderName" value="${escapeHtml(newActorFolderName)}" placeholder="${escapeHtml(DEFAULT_TARGET_FOLDER_NAME)}">
      </div>
    </form>
  `;
}

async function ensureActorFolder({ targetMode, actorFolderId, newActorFolderName }) {
  if (targetMode === "existing") {
    return actorFolderId ? game.folders?.get?.(actorFolderId) ?? null : null;
  }

  const normalizedName = String(newActorFolderName ?? "").trim() || DEFAULT_TARGET_FOLDER_NAME;

  const existingFolder = normalizeCollection(game.folders).find(folder =>
    folder?.type === "Actor" && folder.name === normalizedName
  );

  if (existingFolder) return existingFolder;

  return Folder.create({
    name: normalizedName,
    type: "Actor"
  });
}

function getSourceVehicleItems(actor) {
  if (!actor || actor.documentName !== "Actor") return [];
  return actor.items.filter(item => item.type === "vehicle");
}

async function createVehicleActorFromItem(item, folderId, sourceActor) {
  const actor = await Actor.create({
    name: item.name ?? localize("ZUT.Storage.Items.Unnamed", "Unnamed"),
    type: qualifyModuleActorType(ACTOR_TYPES.VEHICLE),
    folder: folderId ?? null
  });

  try {
    const importResult = await importTwduVehicleItemToModuleVehicle(actor, item);
    if (importResult.status !== "imported") {
      throw new Error(`Vehicle import returned status "${importResult.status}".`);
    }

    const ownerResult = await assignVehicleOwner(actor, sourceActor);
    if (ownerResult.status !== "assigned") {
      throw new Error(`Vehicle owner assignment returned status "${ownerResult.status}".`);
    }

    const driverResult = await assignVehicleDriver(actor, sourceActor);
    if (!["assigned", "alreadyDriver"].includes(driverResult.status)) {
      throw new Error(`Vehicle driver assignment returned status "${driverResult.status}".`);
    }

    return actor;
  } catch (error) {
    await actor.delete().catch(() => {});
    throw error;
  }
}

function collectFormData(html) {
  return {
    sourceActorId: String(html.find("[name='sourceActorId']").val() ?? ""),
    targetMode: String(html.find("[name='targetMode']").val() ?? "existing"),
    actorFolderId: String(html.find("[name='actorFolderId']").val() ?? ""),
    newActorFolderName: String(html.find("[name='newActorFolderName']").val() ?? "")
  };
}

async function promptForConfiguration() {
  const state = {
    sourceActors: getSourceActorOptions(),
    actorFolders: getActorFolderOptions(),
    selectedActorId: "",
    targetMode: "existing",
    selectedActorFolderId: "",
    newActorFolderName: ""
  };

  if (state.sourceActors.length) {
    state.selectedActorId = state.sourceActors[0].id;
  }

  return new Promise(resolve => {
    const dialog = new Dialog({
      title: "Create vehicle actors from actor vehicle items",
      content: buildDialogContent(state),
      buttons: {
        create: {
          label: "Create",
          callback: html => resolve(collectFormData(html))
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "create",
      render: html => {
        const setPanelVisibility = () => {
          const targetMode = String(html.find("[name='targetMode']").val() ?? "existing");
          html.find("[data-target-panel='existing']").prop("hidden", targetMode !== "existing");
          html.find("[data-target-panel='new']").prop("hidden", targetMode !== "new");
        };

        html.find("[name='targetMode']").on("change", () => {
          setPanelVisibility();
        });

        setPanelVisibility();
      },
      close: () => resolve(null)
    });

    dialog.render(true);
  });
}

function validateConfiguration(config) {
  if (!config) return "cancelled";

  if (!config.sourceActorId) {
    throw new Error("Please choose a source actor.");
  }

  return "ready";
}

function formatSummary({ sourceActorName, created, skipped, failed, sourceItemsCount, targetFolderName }) {
  const lines = [
    `<p><strong>Vehicle actor import finished.</strong></p>`,
    `<p>Source actor: ${escapeHtml(sourceActorName)}</p>`,
    `<p>Source vehicle items: ${sourceItemsCount}</p>`,
    `<p>Created: ${created}</p>`,
    `<p>Skipped duplicates: ${skipped}</p>`,
    `<p>Failed: ${failed.length}</p>`,
    `<p>Target folder: ${escapeHtml(targetFolderName || "Root / no folder")}</p>`
  ];

  if (failed.length) {
    const items = failed
      .map(entry => `<li><strong>${escapeHtml(entry.name)}</strong>: ${escapeHtml(entry.error)}</li>`)
      .join("");
    lines.push(`<hr><ul>${items}</ul>`);
  }

  return lines.join("");
}

export async function runCreateVehicleActorsFromActorItemsMacro() {
  if (game.system?.id !== "twdu") {
    ui.notifications?.warn("This macro is intended for the TWDU system.");
    return;
  }

  const config = await promptForConfiguration();

  try {
    if (validateConfiguration(config) === "cancelled") return;
  } catch (error) {
    ui.notifications?.error(error.message ?? "Please complete the macro configuration.");
    return;
  }

  const sourceActor = game.actors?.get?.(config.sourceActorId) ?? null;
  if (!sourceActor) {
    ui.notifications?.error("Selected source actor was not found.");
    return;
  }

  let targetFolder;

  try {
    targetFolder = await ensureActorFolder(config);
  } catch (error) {
    ui.notifications?.error(error.message ?? "Could not prepare the target actor folder.");
    return;
  }

  const sourceItems = getSourceVehicleItems(sourceActor);
  if (!sourceItems.length) {
    ui.notifications?.warn("No TWDU vehicle items were found on the selected actor.");
    return;
  }

  const createdNames = new Set();
  let created = 0;
  let skipped = 0;
  const failed = [];

  for (const item of sourceItems) {
    const itemName = String(item.name ?? "").trim();

    if (!itemName.length) {
      failed.push({
        name: "(unnamed vehicle item)",
        error: "Source item name is empty."
      });
      continue;
    }

    if (createdNames.has(itemName) || isVehicleActorNameTaken(itemName)) {
      skipped += 1;
      continue;
    }

    try {
      await createVehicleActorFromItem(item, targetFolder?.id ?? null, sourceActor);
      created += 1;
      createdNames.add(itemName);
    } catch (error) {
      failed.push({
        name: itemName,
        error: error?.message ?? "Unknown error"
      });
    }
  }

  const summaryContent = formatSummary({
    sourceActorName: sourceActor.name ?? "",
    created,
    skipped,
    failed,
    sourceItemsCount: sourceItems.length,
    targetFolderName: targetFolder?.name ?? ""
  });

  new Dialog({
    title: "Vehicle actor import summary",
    content: summaryContent,
    buttons: {
      ok: {
        label: "OK"
      }
    }
  }).render(true);
}

export default runCreateVehicleActorsFromActorItemsMacro;
