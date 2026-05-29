import { downloadCasparClientPresetXml } from "./preset";
import {
  buildOGrafComponent,
  buildOGrafManifest,
  defaultOGrafManifestFilename,
  defaultOGrafId,
  defaultOGrafMainFilename,
  normalizeOGrafId,
  normalizeOGrafMainFilename,
  normalizeOGrafStepCount,
  riveRuntimeAssetUrl,
} from "./ograf-builders";
import { buildSchema, inspectContents } from "./rive-introspect";
import { buildTemplate } from "./template-builders";
import type { OGrafOptions, RiveContents, RiveContentsArtboard, RiveSchema, Runtime, ViewModelProp } from "./types";
import { $, downloadBlob, fileToBase64, filenameBase, sanitizeFilename } from "./utils";
import { createZip, type ZipSource } from "./zip";

const on = <K extends keyof HTMLElementEventMap>(
  element: HTMLElement | null,
  event: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void => {
  element?.addEventListener(event, handler);
};

const setText = (element: HTMLElement | null, value: string): void => {
  if (element) element.textContent = value;
};

const enable = (element: HTMLButtonElement | null, yes = true): void => {
  if (element) element.disabled = !yes;
};

const show = (element: HTMLElement | null, yes = true): void => {
  if (element) element.style.display = yes ? "" : "none";
};

let elFile: HTMLInputElement | null = null;
let elFileStatus: HTMLElement | null = null;
let elDetected: HTMLElement | null = null;
let elArtSel: HTMLSelectElement | null = null;
let elSmSel: HTMLSelectElement | null = null;
let elVmBody: HTMLTableSectionElement | null = null;
let elInTrig: HTMLSelectElement | null = null;
let elOutTrig: HTMLSelectElement | null = null;
let elNextTrig: HTMLSelectElement | null = null;
let elEmbed: HTMLInputElement | null = null;
let elBtnHtml: HTMLButtonElement | null = null;
let elBtnXml: HTMLButtonElement | null = null;
let elOGrafId: HTMLInputElement | null = null;
let elOGrafName: HTMLInputElement | null = null;
let elOGrafVersion: HTMLInputElement | null = null;
let elOGrafAuthor: HTMLInputElement | null = null;
let elOGrafStepCount: HTMLInputElement | null = null;
let elOGrafMain: HTMLInputElement | null = null;
let elOGrafFallbackTimeline: HTMLSelectElement | null = null;
let elBtnOGrafManifest: HTMLButtonElement | null = null;
let elBtnOGrafJs: HTMLButtonElement | null = null;
let elBtnOGrafZip: HTMLButtonElement | null = null;
let elStatus: HTMLElement | null = null;

let file: File | null = null;
let blobURL: string | null = null;
let contents: RiveContents | null = null;
let schema: RiveSchema | null = null;
let baseName = "graphic";

function revokeBlob(): void {
  try {
    if (blobURL) URL.revokeObjectURL(blobURL);
  } catch {
    // Best-effort URL cleanup only.
  }
  blobURL = null;
}

function currentRuntime(): Runtime {
  const picked = document.querySelector<HTMLInputElement>('input[name="rt"]:checked');
  return picked?.value?.toLowerCase() === "webgl" ? "webgl" : "canvas";
}

function populateSelect(
  select: HTMLSelectElement | null,
  items: string[],
  { placeholder = "- select -" }: { placeholder?: string } = {},
): void {
  if (!select) return;
  select.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  for (const name of items) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
  select.value = "";
}

function updateVmTable(list: ViewModelProp[]): void {
  if (!elVmBody) return;
  elVmBody.innerHTML = "";
  for (const prop of list) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const typeCell = document.createElement("td");
    const valueCell = document.createElement("td");
    nameCell.textContent = prop.name;
    typeCell.textContent = prop.type;
    valueCell.textContent = prop.value == null ? "" : String(prop.value);
    row.append(nameCell, typeCell, valueCell);
    elVmBody.appendChild(row);
  }
}

function populateTriggers(list: ViewModelProp[]): void {
  const names = list.filter((prop) => prop.type === "trigger").map((prop) => prop.name);
  for (const select of [elInTrig, elOutTrig, elNextTrig]) {
    populateSelect(select, names, { placeholder: "- optional -" });
  }
}

function enableOutputButtons(yes: boolean): void {
  enable(elBtnHtml, yes);
  enable(elBtnXml, yes);
  enable(elBtnOGrafManifest, yes);
  enable(elBtnOGrafJs, yes);
  enable(elBtnOGrafZip, yes);
}

function ensureJsFilename(value: string): string {
  return normalizeOGrafMainFilename(value, baseName);
}

function getArtboards(data: RiveContents | null): Array<string | RiveContentsArtboard> {
  if (!data) return [];
  return Array.isArray(data.artboards) ? data.artboards : data.data?.artboards ?? [];
}

function itemName(item: string | { name?: string }): string | null {
  return typeof item === "string" ? item : item.name ?? null;
}

function getArtboardNames(data: RiveContents | null): string[] {
  return getArtboards(data).map(itemName).filter((name): name is string => Boolean(name));
}

function getStateMachineNamesForArtboard(data: RiveContents | null, artName: string): string[] {
  if (!data || !artName) return [];
  const artboard = getArtboards(data).find((item) => itemName(item) === artName);
  if (!artboard || typeof artboard === "string") return [];
  return (artboard.stateMachines ?? []).map(itemName).filter((name): name is string => Boolean(name));
}

function getAnimationNamesForArtboard(data: RiveContents | null, artName: string): string[] {
  if (!data) return [];
  const artboard = getArtboards(data).find((item) => itemName(item) === artName);
  if (artboard && typeof artboard !== "string") {
    const artboardAnimations = artboard.animations ?? artboard.animationNames ?? artboard.timelines ?? [];
    const names = artboardAnimations.map(itemName).filter((name): name is string => Boolean(name));
    if (names.length > 0) return names;
  }

  const fileAnimations = data.animations ?? data.data?.animations ?? [];
  return fileAnimations.map(itemName).filter((name): name is string => Boolean(name));
}

async function analyzeSelectedFile(): Promise<void> {
  if (!file) return;

  setText(elFileStatus, `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

  revokeBlob();
  blobURL = URL.createObjectURL(file);
  baseName = filenameBase(file.name);
  if (elOGrafId) elOGrafId.value = defaultOGrafId(baseName);
  if (elOGrafName) elOGrafName.value = baseName;
  if (elOGrafMain) elOGrafMain.value = defaultOGrafMainFilename(baseName);

  setText(elStatus, "Loading Rive...");

  try {
    contents = await inspectContents(blobURL);
  } catch (error) {
    console.error(error);
    setText(elStatus, "Failed to open Rive (see console).");
    return;
  }

  populateSelect(elArtSel, getArtboardNames(contents), { placeholder: "- choose artboard -" });
  populateSelect(elSmSel, [], { placeholder: "- choose state machine -" });
  populateSelect(elOGrafFallbackTimeline, [], { placeholder: "- optional -" });

  schema = null;
  updateVmTable([]);
  populateTriggers([]);
  show(elDetected, true);
  enableOutputButtons(false);
  setText(elStatus, "Choose an artboard, then a state machine.");
}

async function maybeBuildSchema(): Promise<void> {
  if (!file || !blobURL) return;
  const artboard = elArtSel?.value || "";
  const stateMachine = elSmSel?.value || "";
  if (!artboard || !stateMachine) {
    schema = null;
    updateVmTable([]);
    populateTriggers([]);
    enableOutputButtons(false);
    setText(elStatus, "Choose an artboard, then a state machine.");
    return;
  }

  try {
    schema = await buildSchema(blobURL, undefined, artboard, stateMachine);
    updateVmTable(schema.viewModelProps);
    populateTriggers(schema.viewModelProps);
    enableOutputButtons(true);
    setText(elStatus, "Rive ready.");
  } catch (error) {
    console.error(error);
    schema = null;
    updateVmTable([]);
    populateTriggers([]);
    enableOutputButtons(false);
    setText(elStatus, "Failed to build schema (see console).");
  }
}

async function getOGrafOptions(): Promise<OGrafOptions | null> {
  if (!schema) {
    setText(elStatus, "Select artboard & state machine first.");
    return null;
  }

  const embed = Boolean(elEmbed?.checked);
  let base64 = "";
  let rivPath = "";
  if (embed) {
    if (!file) {
      setText(elStatus, "Select a .riv to embed.");
      return null;
    }
    base64 = await fileToBase64(file);
  } else {
    rivPath = file ? file.name : "graphic.riv";
  }

  const stepCount = Number(elOGrafStepCount?.value ?? 1);
  const authorName = elOGrafAuthor?.value.trim() || "";

  return {
    id: normalizeOGrafId(elOGrafId?.value || "", baseName),
    name: elOGrafName?.value.trim() || baseName,
    version: elOGrafVersion?.value.trim() || "1.0.0",
    author: authorName ? { name: authorName } : undefined,
    mainFilename: ensureJsFilename(elOGrafMain?.value || ""),
    runtime: currentRuntime(),
    embed,
    base64,
    rivPath,
    stepCount: normalizeOGrafStepCount(stepCount),
    fallbackTimeline: elOGrafFallbackTimeline?.value || null,
    triggers: {
      in: elInTrig?.value || null,
      out: elOutTrig?.value || null,
      next: elNextTrig?.value || null,
    },
  };
}

async function fetchRuntimeAsset(runtime: Runtime, assetName: string): Promise<Blob> {
  const url = riveRuntimeAssetUrl(runtime, assetName);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${assetName} (${response.status})`);
  return response.blob();
}

async function maybeFetchRuntimeAsset(runtime: Runtime, assetName: string): Promise<Blob | null> {
  try {
    return await fetchRuntimeAsset(runtime, assetName);
  } catch {
    return null;
  }
}

async function downloadOGrafZipPackage(options: OGrafOptions): Promise<void> {
  if (!schema || !file) {
    setText(elStatus, "Select a .riv first.");
    return;
  }

  setText(elStatus, "Downloading Rive runtime...");
  const runtimeScript = await fetchRuntimeAsset(options.runtime, "rive.js");
  const runtimeWasm = await fetchRuntimeAsset(options.runtime, "rive.wasm");
  const runtimeWasmFallback = await maybeFetchRuntimeAsset(options.runtime, "rive_fallback.wasm");

  const rivFilename = sanitizeFilename(file.name) || `${filenameBase(file.name)}.riv`;
  const packageOptions: OGrafOptions = {
    ...options,
    embed: false,
    base64: "",
    rivPath: rivFilename,
    runtimeScriptUrl: "rive-runtime.js",
    runtimeWasmUrl: "rive.wasm",
    runtimeWasmFallbackUrl: runtimeWasmFallback ? "rive_fallback.wasm" : null,
  };

  const manifestName = defaultOGrafManifestFilename(packageOptions.mainFilename, packageOptions.name);
  const files: ZipSource[] = [
    { filename: manifestName, data: buildOGrafManifest(schema, packageOptions) },
    { filename: packageOptions.mainFilename, data: buildOGrafComponent(schema, packageOptions) },
    { filename: rivFilename, data: file },
    { filename: "rive-runtime.js", data: runtimeScript },
    { filename: "rive.wasm", data: runtimeWasm },
  ];

  if (runtimeWasmFallback) {
    files.push({ filename: "rive_fallback.wasm", data: runtimeWasmFallback });
  }

  setText(elStatus, "Building OGraf ZIP...");
  const zipName = `${filenameBase(packageOptions.mainFilename)}-ograf.zip`;
  const zip = await createZip(files);
  downloadBlob(zip, zipName);
  setText(elStatus, `Downloaded ${zipName}`);
}

function wire(): void {
  const elVmTable = $<HTMLTableElement>("#vmTable");
  elFile = $<HTMLInputElement>("#rivfile") || document.querySelector<HTMLInputElement>('input[type="file"]');
  elFileStatus = $<HTMLElement>("#fileStatus");
  elDetected = $<HTMLElement>("#detected");
  elArtSel = $<HTMLSelectElement>("#artSel");
  elSmSel = $<HTMLSelectElement>("#smSel");
  elVmBody = $<HTMLTableSectionElement>("#vmBody") || elVmTable?.querySelector<HTMLTableSectionElement>("tbody") || null;
  elInTrig = $<HTMLSelectElement>("#inTrig");
  elOutTrig = $<HTMLSelectElement>("#outTrig");
  elNextTrig = $<HTMLSelectElement>("#nextTrig");
  elEmbed = $<HTMLInputElement>("#embedCaspar");
  elBtnHtml = $<HTMLButtonElement>("#dlCaspar");
  elBtnXml = $<HTMLButtonElement>("#dlCasparXml");
  elOGrafId = $<HTMLInputElement>("#ografId");
  elOGrafName = $<HTMLInputElement>("#ografName");
  elOGrafVersion = $<HTMLInputElement>("#ografVersion");
  elOGrafAuthor = $<HTMLInputElement>("#ografAuthor");
  elOGrafStepCount = $<HTMLInputElement>("#ografStepCount");
  elOGrafMain = $<HTMLInputElement>("#ografMain");
  elOGrafFallbackTimeline = $<HTMLSelectElement>("#ografFallbackTimeline");
  elBtnOGrafManifest = $<HTMLButtonElement>("#dlOGrafManifest");
  elBtnOGrafJs = $<HTMLButtonElement>("#dlOGrafJs");
  elBtnOGrafZip = $<HTMLButtonElement>("#dlOGrafZip");
  elStatus = $<HTMLElement>("#status");

  if (!elFile) {
    console.warn("No file input found (expected #rivfile).");
    setText(elStatus, "No file input found.");
    return;
  }

  show(elDetected, false);
  enableOutputButtons(false);
  setText(elFileStatus, "No file selected.");

  on(elFile, "change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const selectedFile = input?.files?.[0] ?? null;
    if (!selectedFile) return;
    file = selectedFile;
    void analyzeSelectedFile();
  });

  on(elArtSel, "change", () => {
    populateSelect(elSmSel, getStateMachineNamesForArtboard(contents, elArtSel?.value || ""), {
      placeholder: "- choose state machine -",
    });
    populateSelect(elOGrafFallbackTimeline, getAnimationNamesForArtboard(contents, elArtSel?.value || ""), {
      placeholder: "- optional -",
    });
    void maybeBuildSchema();
  });

  on(elSmSel, "change", () => {
    void maybeBuildSchema();
  });

  on(elBtnHtml, "click", async () => {
    if (!schema) {
      setText(elStatus, "Select artboard & state machine first.");
      return;
    }

    const runtime = currentRuntime();
    const embed = Boolean(elEmbed?.checked);
    let base64 = "";
    let rivPath = "";
    if (embed) {
      if (!file) {
        setText(elStatus, "Select a .riv to embed.");
        return;
      }
      base64 = await fileToBase64(file);
    } else {
      rivPath = file ? file.name : "graphic.riv";
    }

    const html = buildTemplate(schema, {
      runtime,
      embed,
      base64,
      rivPath,
      casparTriggers: {
        in: elInTrig?.value || null,
        out: elOutTrig?.value || null,
        next: elNextTrig?.value || null,
      },
    });

    const outName = `caspar-${baseName}.html`;
    downloadBlob(new Blob([html], { type: "text/html" }), outName);
    setText(elStatus, `Downloaded ${outName}`);
  });

  on(elBtnXml, "click", () => {
    if (!schema) {
      setText(elStatus, "Select artboard & state machine first.");
      return;
    }
    const htmlName = `caspar-${baseName}.html`;
    downloadCasparClientPresetXml(schema, htmlName, { layer: 20, sendAsJson: false });
    setText(elStatus, `Downloaded ${htmlName.replace(/\.html$/i, ".xml")}`);
  });

  on(elBtnOGrafManifest, "click", async () => {
    if (!schema) {
      setText(elStatus, "Select artboard & state machine first.");
      return;
    }
    const options = await getOGrafOptions();
    if (!options) return;
    const manifestName = defaultOGrafManifestFilename(options.mainFilename, options.name);
    downloadBlob(
      new Blob([buildOGrafManifest(schema, options)], { type: "application/json" }),
      manifestName,
    );
    setText(elStatus, `Downloaded ${manifestName}`);
  });

  on(elBtnOGrafJs, "click", async () => {
    if (!schema) {
      setText(elStatus, "Select artboard & state machine first.");
      return;
    }
    const options = await getOGrafOptions();
    if (!options) return;
    downloadBlob(
      new Blob([buildOGrafComponent(schema, options)], { type: "text/javascript" }),
      options.mainFilename,
    );
    setText(elStatus, `Downloaded ${options.mainFilename}`);
  });

  on(elBtnOGrafZip, "click", async () => {
    if (!schema) {
      setText(elStatus, "Select artboard & state machine first.");
      return;
    }
    const options = await getOGrafOptions();
    if (!options) return;
    try {
      await downloadOGrafZipPackage(options);
    } catch (error) {
      console.error(error);
      setText(elStatus, "Failed to download OGraf ZIP (see console).");
    }
  });

  window.addEventListener("beforeunload", revokeBlob);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire);
} else {
  wire();
}
