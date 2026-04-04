import {
  ACTOR_TYPES,
  qualifyModuleActorType
} from "../scripts/core/constants.js";
import { importTwduVehicleItemToModuleVehicle } from "../scripts/services/twdu-vehicle-integration.service.js";

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

function getPackFolderPathLabel(pack, folder) {
  if (!pack || !folder) return "";

  const folders = normalizeCollection(pack.folders);
  const folderMap = new Map(folders.map(entry => [entry.id, entry]));
  const names = [folder.name ?? ""];
  let parentId = folder.folder ?? folder._source?.folder ?? null;

  while (parentId) {
    const parent = folderMap.get(parentId) ?? null;
    if (!parent) break;
    names.unshift(parent.name ?? "");
    parentId = parent.folder ?? parent._source?.folder ?? null;
  }

  return names.filter(Boolean).join(" / ");
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

function getWorldVehicleSourceFolders() {
  const folders = normalizeCollection(game.folders).filter(folder => folder?.type === "Item");
  const directFolders = [];

  for (const folder of folders) {
    const hasVehicleItems = (game.items ?? []).some(item =>
      item.type === "vehicle" && item.folder?.id === folder.id
    );

    if (!hasVehicleItems) continue;

    directFolders.push({
      id: folder.id,
      label: getFolderPathLabel(folder)
    });
  }

  return directFolders.sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang));
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

function getItemCompendiumOptions() {
  return normalizeCollection(game.packs)
    .filter(pack => pack?.documentName === "Item")
    .map(pack => ({
      id: pack.collection,
      label: pack.metadata?.label ?? pack.title ?? pack.collection
    }))
    .sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang));
}

async function getCompendiumVehicleFolderOptions(packCollection) {
  const pack = game.packs?.get(packCollection) ?? null;
  if (!pack) return [];

  await pack.getIndex();

  const folders = normalizeCollection(pack.folders);
  if (!folders.length) return [];

  const vehicleFolderIds = new Set(
    (pack.index ?? [])
      .filter(entry => entry.type === "vehicle" && entry.folder)
      .map(entry => typeof entry.folder === "string" ? entry.folder : (entry.folder?.id ?? entry.folder?._id ?? ""))
      .filter(Boolean)
  );

  return folders
    .filter(folder => vehicleFolderIds.has(folder.id))
    .map(folder => ({
      id: folder.id,
      label: getPackFolderPathLabel(pack, folder)
    }))
    .sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang));
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
  worldFolders,
  actorFolders,
  compendiumOptions,
  selectedSourceType = "world",
  selectedWorldFolderId = "",
  selectedPackCollection = "",
  compendiumFolderOptions = [],
  selectedCompendiumFolderId = "",
  targetMode = "existing",
  selectedActorFolderId = "",
  newActorFolderName = ""
}) {
  return `
    <form class="zut-macro-form">
      <div class="form-group">
        <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActors.SourceType", "Source type"))}</label>
        <select name="sourceType">
          <option value="world"${selectedSourceType === "world" ? " selected" : ""}>World folder</option>
          <option value="compendium"${selectedSourceType === "compendium" ? " selected" : ""}>Compendium</option>
        </select>
      </div>

      <div class="form-group" data-source-panel="world"${selectedSourceType === "world" ? "" : " hidden"}>
        <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActors.SourceFolder", "Source item folder"))}</label>
        <select name="worldFolderId">
          ${buildOptionsHtml(worldFolders, {
            selected: selectedWorldFolderId,
            blankLabel: worldFolders.length ? "-- Select folder --" : "-- No vehicle item folders found --"
          })}
        </select>
      </div>

      <div data-source-panel="compendium"${selectedSourceType === "compendium" ? "" : " hidden"}>
        <div class="form-group">
          <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActors.CompendiumPack", "Compendium pack"))}</label>
          <select name="packCollection">
            ${buildOptionsHtml(compendiumOptions, {
              selected: selectedPackCollection,
              blankLabel: compendiumOptions.length ? "-- Select compendium --" : "-- No item compendiums found --"
            })}
          </select>
        </div>
        <div class="form-group">
          <label>${escapeHtml(localize("ZUT.Macros.CreateVehicleActors.CompendiumFolder", "Compendium folder"))}</label>
          <select name="compendiumFolderId">
            ${buildOptionsHtml(compendiumFolderOptions, {
              selected: selectedCompendiumFolderId,
              blankLabel: compendiumFolderOptions.length ? "-- Select folder --" : "-- No vehicle folders found in pack --"
            })}
          </select>
        </div>
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

async function getSourceVehicleItems({ sourceType, worldFolderId, packCollection, compendiumFolderId }) {
  if (sourceType === "world") {
    return (game.items ?? []).filter(item => item.type === "vehicle" && item.folder?.id === worldFolderId);
  }

  const pack = game.packs?.get(packCollection) ?? null;
  if (!pack) {
    throw new Error("Selected compendium pack was not found.");
  }

  const documents = await pack.getDocuments();
  return documents.filter(item => item.type === "vehicle" && item.folder?.id === compendiumFolderId);
}

async function createVehicleActorFromItem(item, folderId) {
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

    return actor;
  } catch (error) {
    await actor.delete().catch(() => {});
    throw error;
  }
}

function collectFormData(html) {
  const sourceType = html.find("[name='sourceType']").val();
  const worldFolderId = html.find("[name='worldFolderId']").val();
  const packCollection = html.find("[name='packCollection']").val();
  const compendiumFolderId = html.find("[name='compendiumFolderId']").val();
  const targetMode = html.find("[name='targetMode']").val();
  const actorFolderId = html.find("[name='actorFolderId']").val();
  const newActorFolderName = html.find("[name='newActorFolderName']").val();

  return {
    sourceType: String(sourceType ?? "world"),
    worldFolderId: String(worldFolderId ?? ""),
    packCollection: String(packCollection ?? ""),
    compendiumFolderId: String(compendiumFolderId ?? ""),
    targetMode: String(targetMode ?? "existing"),
    actorFolderId: String(actorFolderId ?? ""),
    newActorFolderName: String(newActorFolderName ?? "")
  };
}

async function promptForConfiguration() {
  const state = {
    worldFolders: getWorldVehicleSourceFolders(),
    actorFolders: getActorFolderOptions(),
    compendiumOptions: getItemCompendiumOptions(),
    selectedSourceType: "world",
    selectedWorldFolderId: "",
    selectedPackCollection: "",
    compendiumFolderOptions: [],
    selectedCompendiumFolderId: "",
    targetMode: "existing",
    selectedActorFolderId: "",
    newActorFolderName: ""
  };

  if (state.worldFolders.length) {
    state.selectedWorldFolderId = state.worldFolders[0].id;
  }

  if (state.compendiumOptions.length) {
    state.selectedPackCollection = state.compendiumOptions[0].id;
    state.compendiumFolderOptions = await getCompendiumVehicleFolderOptions(state.selectedPackCollection);
    if (state.compendiumFolderOptions.length) {
      state.selectedCompendiumFolderId = state.compendiumFolderOptions[0].id;
    }
  }

  return new Promise(resolve => {
    const dialog = new Dialog({
      title: "Create vehicle actors from TWDU vehicle items",
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
          const sourceType = String(html.find("[name='sourceType']").val() ?? "world");
          const targetMode = String(html.find("[name='targetMode']").val() ?? "existing");

          html.find("[data-source-panel='world']").prop("hidden", sourceType !== "world");
          html.find("[data-source-panel='compendium']").prop("hidden", sourceType !== "compendium");
          html.find("[data-target-panel='existing']").prop("hidden", targetMode !== "existing");
          html.find("[data-target-panel='new']").prop("hidden", targetMode !== "new");
        };

        const refreshCompendiumFolderOptions = async () => {
          const packCollection = String(html.find("[name='packCollection']").val() ?? "");
          const folderSelect = html.find("[name='compendiumFolderId']");

          const folderOptions = packCollection
            ? await getCompendiumVehicleFolderOptions(packCollection)
            : [];

          const currentFolderId = String(folderSelect.val() ?? "");
          const selectedFolderId = folderOptions.some(option => option.id === currentFolderId)
            ? currentFolderId
            : (folderOptions[0]?.id ?? "");

          folderSelect.html(buildOptionsHtml(folderOptions, {
            selected: selectedFolderId,
            blankLabel: folderOptions.length ? "-- Select folder --" : "-- No vehicle folders found in pack --"
          }));
        };

        html.find("[name='sourceType']").on("change", () => {
          setPanelVisibility();
        });

        html.find("[name='targetMode']").on("change", () => {
          setPanelVisibility();
        });

        html.find("[name='packCollection']").on("change", () => {
          void refreshCompendiumFolderOptions();
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

  if (config.sourceType === "world" && !config.worldFolderId) {
    throw new Error("Please choose a world item folder.");
  }

  if (config.sourceType === "compendium") {
    if (!config.packCollection) {
      throw new Error("Please choose a compendium pack.");
    }

    if (!config.compendiumFolderId) {
      throw new Error("Please choose a compendium folder.");
    }
  }

  return "ready";
}

function formatSummary({ created, skipped, failed, sourceItemsCount, targetFolderName }) {
  const lines = [
    `<p><strong>Vehicle actor import finished.</strong></p>`,
    `<p>Source items: ${sourceItemsCount}</p>`,
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

export async function runCreateVehicleActorsMacro() {
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

  let targetFolder;

  try {
    targetFolder = await ensureActorFolder(config);
  } catch (error) {
    ui.notifications?.error(error.message ?? "Could not prepare the target actor folder.");
    return;
  }

  let sourceItems;

  try {
    sourceItems = await getSourceVehicleItems(config);
  } catch (error) {
    ui.notifications?.error(error.message ?? "Could not load source vehicle items.");
    return;
  }

  if (!sourceItems.length) {
    ui.notifications?.warn("No TWDU vehicle items were found in the selected source folder.");
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
      await createVehicleActorFromItem(item, targetFolder?.id ?? null);
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

export default runCreateVehicleActorsMacro;
