import type { OGrafFile, OGrafOptions, OGrafRenderRequirement, RiveSchema, ViewModelProp } from "./types";

const OGRAF_SCHEMA_URL = "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json";
const DEFAULT_STEP_COUNT = 1;
const RIVE_RUNTIME_VERSION = "2.32.0";

function slugify(value: string): string {
  return String(value || "graphic")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "graphic";
}

function actionId(name: string): string {
  return slugify(name);
}

export function riveRuntimePackage(runtime: OGrafOptions["runtime"]): string {
  return runtime === "webgl" ? "@rive-app/webgl" : "@rive-app/canvas";
}

export function riveRuntimeAssetUrl(runtime: OGrafOptions["runtime"], assetName = "rive.js"): string {
  return `https://unpkg.com/${riveRuntimePackage(runtime)}@${RIVE_RUNTIME_VERSION}/${assetName}`;
}

function runtimeScriptUrl(runtime: OGrafOptions["runtime"]): string {
  return riveRuntimeAssetUrl(runtime, "rive.js");
}

function schemaTypeForProp(prop: ViewModelProp): string {
  if (prop.type === "number" || prop.type === "boolean" || prop.type === "string") return prop.type;
  if (prop.type === "color" || prop.type === "image") return "string";
  return "boolean";
}

function colorToHex(value: ViewModelProp["value"]): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rgb = value & 0x00ffffff;
    return `#${rgb.toString(16).padStart(6, "0")}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-f]{8}$/i.test(trimmed)) return `#${trimmed.slice(3).toLowerCase()}`;
  }
  return undefined;
}

function schemaDefaultForProp(prop: ViewModelProp): unknown {
  if (prop.value == null) return undefined;
  if (prop.type === "number") {
    const numeric = Number(prop.value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (prop.type === "boolean") return Boolean(prop.value);
  if (prop.type === "string") return String(prop.value);
  if (prop.type === "color") return colorToHex(prop.value);
  return undefined;
}

function buildPropertySchema(prop: ViewModelProp): Record<string, unknown> {
  const property: Record<string, unknown> = {
    type: schemaTypeForProp(prop),
    title: prop.name,
  };

  const defaultValue = schemaDefaultForProp(prop);
  if (defaultValue !== undefined) property.default = defaultValue;

  if (prop.type === "string") {
    property.gddType = "single-line";
  } else if (prop.type === "color") {
    property.gddType = "color-rrggbb";
    property.pattern = "^#[0-9a-f]{6}$";
  } else if (prop.type === "image") {
    property.gddType = "file-path/image-path";
    property.gddOptions = {
      extensions: ["png", "jpg", "jpeg", "webp", "gif"],
    };
  }

  return property;
}

export function normalizeOGrafId(value: string, fallbackName = "graphic"): string {
  const normalized = String(value || "").trim().replace(/\//g, ".");
  return normalized || defaultOGrafId(fallbackName);
}

export function normalizeOGrafMainFilename(value: string, fallbackName = "graphic"): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return defaultOGrafMainFilename(fallbackName);
  return /\.js$/i.test(trimmed) ? trimmed : `${trimmed}.js`;
}

export function defaultOGrafManifestFilename(mainFilename: string, fallbackName = "graphic"): string {
  return normalizeOGrafMainFilename(mainFilename, fallbackName).replace(/\.js$/i, ".ograf.json");
}

export function normalizeOGrafStepCount(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_STEP_COUNT;
  return Math.max(-1, Math.trunc(numeric));
}

function buildDataSchema(props: ViewModelProp[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const prop of props.filter((item) => item.type !== "trigger")) {
    properties[prop.name] = buildPropertySchema(prop);
  }
  return {
    type: "object",
    properties,
    additionalProperties: false,
  };
}

function buildRenderRequirements(options: OGrafOptions): OGrafRenderRequirement[] {
  const usesBundledRuntime = Boolean(options.runtimeScriptUrl);
  return [
    {
      resolution: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      frameRate: { ideal: 50 },
      accessToPublicInternet: { ideal: !usesBundledRuntime },
    },
  ];
}

export function buildOGrafManifest(schema: RiveSchema, options: OGrafOptions): string {
  const triggerProps = schema.viewModelProps.filter((prop) => prop.type === "trigger");
  const mainFilename = normalizeOGrafMainFilename(options.mainFilename, options.name);
  const manifest = {
    $schema: OGRAF_SCHEMA_URL,
    id: normalizeOGrafId(options.id, options.name),
    version: options.version || undefined,
    name: options.name,
    description: options.description || undefined,
    author: options.author?.name ? options.author : undefined,
    main: mainFilename,
    customActions: triggerProps.map((prop) => ({
      id: actionId(prop.name),
      name: prop.name,
    })),
    supportsRealTime: true,
    supportsNonRealTime: Boolean(options.fallbackTimeline),
    stepCount: normalizeOGrafStepCount(options.stepCount),
    schema: buildDataSchema(schema.viewModelProps),
    renderRequirements: buildRenderRequirements(options),
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildOGrafComponent(schema: RiveSchema, options: OGrafOptions): string {
  const vmTypes = Object.fromEntries(schema.viewModelProps.map((prop) => [prop.name, prop.type]));
  const vmIndex = Object.fromEntries(schema.viewModelProps.map((prop) => [prop.name.toLowerCase(), prop.name]));
  const triggerMap = Object.fromEntries(
    schema.viewModelProps.filter((prop) => prop.type === "trigger").map((prop) => [actionId(prop.name), prop.name]),
  );
  const triggers = {
    in: options.triggers?.in || null,
    out: options.triggers?.out || null,
    next: options.triggers?.next || null,
  };
  const stepCount = normalizeOGrafStepCount(options.stepCount);
  const fallbackTimeline = options.fallbackTimeline || "";

  return `const RUNTIME_URL = ${JSON.stringify(options.runtimeScriptUrl || runtimeScriptUrl(options.runtime))};
const RUNTIME_WASM_URL = ${JSON.stringify(options.runtimeWasmUrl || "")};
const RUNTIME_WASM_FALLBACK_URL = ${JSON.stringify(options.runtimeWasmFallbackUrl || "")};
const RIV_BASE64 = ${JSON.stringify(options.embed ? options.base64 || "" : "")};
const RIV_PATH = ${JSON.stringify(options.embed ? "" : options.rivPath || "graphic.riv")};
const ARTBOARD = ${JSON.stringify(schema.artboard || "")};
const STATE_MACHINE = ${JSON.stringify(schema.stateMachine || "")};
const FALLBACK_TIMELINE = ${JSON.stringify(fallbackTimeline)};
const VM_TYPES = ${JSON.stringify(vmTypes, null, 2)};
const VM_INDEX = ${JSON.stringify(vmIndex, null, 2)};
const TRIGGERS = ${JSON.stringify(triggers, null, 2)};
const CUSTOM_ACTIONS = ${JSON.stringify(triggerMap, null, 2)};

let riveRuntimePromise = null;

function resolveModuleUrl(value) {
  if (!value) return "";
  try { return new URL(value, import.meta.url).href; }
  catch (_) { return value; }
}

function configureRiveRuntime(runtime) {
  const loader = runtime?.RuntimeLoader;
  if (!loader) return;
  const wasmUrl = resolveModuleUrl(RUNTIME_WASM_URL);
  if (wasmUrl && typeof loader.setWasmUrl === "function") loader.setWasmUrl(wasmUrl);
  if (typeof loader.setWasmFallbackUrl === "function") {
    const fallbackUrl = resolveModuleUrl(RUNTIME_WASM_FALLBACK_URL);
    loader.setWasmFallbackUrl(fallbackUrl || null);
  }
}

function loadRiveRuntime() {
  if (globalThis.rive?.Rive) {
    configureRiveRuntime(globalThis.rive);
    return Promise.resolve(globalThis.rive);
  }
  if (riveRuntimePromise) return riveRuntimePromise;
  riveRuntimePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = resolveModuleUrl(RUNTIME_URL);
    script.onload = () => {
      if (!globalThis.rive?.Rive) {
        reject(new Error("Rive runtime did not initialize"));
        return;
      }
      configureRiveRuntime(globalThis.rive);
      resolve(globalThis.rive);
    };
    script.onerror = () => reject(new Error("Failed to load Rive runtime"));
    document.head.appendChild(script);
  });
  return riveRuntimePromise;
}

function base64ToBlobUrl(base64) {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
}

function toColor32(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (value.charAt(0) === "#") {
    return (value.length === 7 ? (0xFF000000 | parseInt(value.slice(1), 16)) >>> 0 : parseInt(value.slice(1), 16) >>> 0);
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric >>> 0 : null;
}

function decodeAndSetImage(imageProperty, bytes) {
  try {
    globalThis.rive.decodeImage(bytes)
      .then((image) => {
        try { imageProperty.value = image; }
        finally {
          try { image.unref && image.unref(); } catch (_) {}
        }
      })
      .catch((error) => console.error("decodeImage failed", error));
  } catch (error) {
    console.error("decodeImage threw", error);
  }
}

function setImageFromSource(viewModel, propName, src) {
  if (!viewModel) return;
  try {
    const imageProperty = viewModel.image ? viewModel.image(propName) : null;
    if (!imageProperty) return;
    if (src == null) return;
    const value = String(src).trim();
    if (!value) return;
    if (value.toLowerCase() === "clear" || value.toLowerCase() === "none" || value.toLowerCase() === "null") {
      imageProperty.value = null;
      return;
    }

    if (/^data:/i.test(value)) {
      const markerIndex = value.indexOf("base64,");
      if (markerIndex < 0) {
        console.warn("data: URL without base64 not supported");
        return;
      }
      const binary = atob(value.slice(markerIndex + 7));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      decodeAndSetImage(imageProperty, bytes);
      return;
    }

    if (/^b64:/i.test(value)) {
      const binary = atob(value.slice(4));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      decodeAndSetImage(imageProperty, bytes);
      return;
    }

    if (/^https?:/i.test(value)) {
      fetch(value, { cache: "no-store" })
        .then((response) => response.arrayBuffer())
        .then((buffer) => decodeAndSetImage(imageProperty, new Uint8Array(buffer)))
        .catch((error) => console.error("fetch image failed", error));
      return;
    }

    if (/^(?:\\.{0,2}\\/|[^:]+\\.(?:png|jpe?g|webp|gif|bmp|svg))(?:[?#].*)?$/i.test(value)) {
      fetch(resolveModuleUrl(value), { cache: "no-store" })
        .then((response) => response.arrayBuffer())
        .then((buffer) => decodeAndSetImage(imageProperty, new Uint8Array(buffer)))
        .catch((error) => console.error("fetch image failed", error));
      return;
    }

    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      decodeAndSetImage(imageProperty, bytes);
    } catch (_) {
      console.warn("Unrecognized image value:", value);
    }
  } catch (error) {
    console.error("setImageFromSource failed", error);
  }
}

function exactVmName(name) {
  return VM_TYPES[name] ? name : VM_INDEX[String(name).toLowerCase()] || name;
}

export default class RiveOGrafGraphic extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.rive = null;
    this.viewModel = null;
    this.rivUrl = null;
    this.currentStep = undefined;
    this.actionsSchedule = [];
    this.initialData = {};
    this.renderType = "realtime";
    this.loaded = false;
  }

  async load(params = {}) {
    const runtime = await loadRiveRuntime();
    this.renderType = params.renderType === "non-realtime" ? "non-realtime" : "realtime";
    this.initialData = params.data && typeof params.data === "object" ? { ...params.data } : {};
    this.shadowRoot.innerHTML = \`<style>:host{display:block;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style><canvas width="1920" height="1080"></canvas>\`;
    const canvas = this.shadowRoot.querySelector("canvas");
    this.rivUrl = RIV_BASE64 ? base64ToBlobUrl(RIV_BASE64) : resolveModuleUrl(RIV_PATH);
    const useFallbackTimeline = this.renderType === "non-realtime" && FALLBACK_TIMELINE;

    await new Promise((resolve, reject) => {
      this.rive = new runtime.Rive({
        src: this.rivUrl,
        canvas,
        autoplay: false,
        artboard: ARTBOARD || undefined,
        animations: useFallbackTimeline ? FALLBACK_TIMELINE : undefined,
        stateMachines: useFallbackTimeline ? undefined : STATE_MACHINE || undefined,
        autoBind: true,
        onLoad: () => {
          try { this.rive?.resizeDrawingSurfaceToCanvas?.(); } catch (_) {}
          this.viewModel = this.rive?.viewModelInstance || null;
          this.apply(this.initialData);
          if (useFallbackTimeline && typeof this.rive?.scrub === "function") {
            try {
              this.rive.pause?.(FALLBACK_TIMELINE);
              this.rive.scrub(FALLBACK_TIMELINE, 0);
            } catch (_) {}
          }
          this.loaded = true;
          resolve();
        },
        onLoadError: (error) => reject(error || new Error("Failed to load Rive file")),
      });
    });

    return { statusCode: 200 };
  }

  async dispose() {
    try { this.rive?.cleanup?.(); } catch (_) {}
    this.rive = null;
    this.viewModel = null;
    if (this.rivUrl && RIV_BASE64) {
      try { URL.revokeObjectURL(this.rivUrl); } catch (_) {}
    }
    this.rivUrl = null;
    this.loaded = false;
    return { statusCode: 200 };
  }

  async playAction(params = {}) {
    const stepCount = ${JSON.stringify(stepCount)};
    const goto = params.goto;
    const delta = params.delta ?? 1;
    const fromStep = this.currentStep == null ? -1 : this.currentStep;
    const targetStep = goto !== undefined ? goto : fromStep + delta;

    try { this.rive?.play?.(STATE_MACHINE || undefined); } catch (_) {}
    if (this.currentStep == null && TRIGGERS.in) this.fireVmTrigger(TRIGGERS.in);
    else if (TRIGGERS.next) this.fireVmTrigger(TRIGGERS.next);

    this.currentStep = stepCount >= 0 && targetStep >= stepCount ? undefined : targetStep;
    return { statusCode: 200, currentStep: this.currentStep };
  }

  async stopAction(params = {}) {
    const fired = TRIGGERS.out ? this.fireVmTrigger(TRIGGERS.out) : false;
    if (!fired) {
      try { this.rive?.stop?.(STATE_MACHINE || undefined); } catch (_) {}
    }
    this.currentStep = undefined;
    return { statusCode: 200 };
  }

  async updateAction(params = {}) {
    this.apply(params.data || {});
    return { statusCode: 200 };
  }

  async customAction(params = {}) {
    const triggerName = CUSTOM_ACTIONS[params.id];
    if (!triggerName) return { statusCode: 404, statusMessage: "Unknown custom action" };
    this.fireVmTrigger(triggerName);
    return { statusCode: 200 };
  }

  async setActionsSchedule(params = {}) {
    this.actionsSchedule = Array.isArray(params.schedule)
      ? [...params.schedule].sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0))
      : [];
    return { statusCode: 200 };
  }

  async goToTime(params = {}) {
    if (!FALLBACK_TIMELINE) {
      return { statusCode: 501, statusMessage: "Non-real-time fallback timeline is not configured" };
    }
    if (!this.rive) {
      return { statusCode: 409, statusMessage: "Graphic is not loaded" };
    }

    const timestamp = Number(params.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      return { statusCode: 400, statusMessage: "Invalid timestamp" };
    }

    if (typeof this.rive.scrub !== "function") {
      return { statusCode: 501, statusMessage: "Rive runtime does not support timeline scrubbing" };
    }

    try {
      this.applyScheduledActions(timestamp);
      if (params.data) this.apply(params.data);
      this.rive.pause?.(FALLBACK_TIMELINE);
      this.rive.scrub(FALLBACK_TIMELINE, timestamp / 1000);
      this.rive.resizeDrawingSurfaceToCanvas?.();
      return { statusCode: 200 };
    } catch (error) {
      return { statusCode: 500, statusMessage: error?.message || "Failed to seek fallback timeline" };
    }
  }

  applyScheduledActions(timestamp) {
    this.currentStep = undefined;
    this.apply(this.initialData);
    for (const item of this.actionsSchedule) {
      if (Number(item?.timestamp) > timestamp) break;
      this.applyScheduledAction(item?.action || {});
    }
  }

  applyScheduledAction(action = {}) {
    const params = action.params || {};
    if (action.type === "updateAction") this.apply(params.data || {});
    else if (action.type === "playAction") this.applyScheduledPlay(params);
    else if (action.type === "stopAction") {
      if (TRIGGERS.out) this.fireVmTrigger(TRIGGERS.out);
      this.currentStep = undefined;
    } else if (action.type === "customAction") {
      const triggerName = CUSTOM_ACTIONS[params.id];
      if (triggerName) this.fireVmTrigger(triggerName);
    }
  }

  applyScheduledPlay(params = {}) {
    const stepCount = ${JSON.stringify(stepCount)};
    const goto = params.goto;
    const delta = params.delta ?? 1;
    const fromStep = this.currentStep == null ? -1 : this.currentStep;
    const targetStep = goto !== undefined ? goto : fromStep + delta;
    if (this.currentStep == null && TRIGGERS.in) this.fireVmTrigger(TRIGGERS.in);
    else if (TRIGGERS.next) this.fireVmTrigger(TRIGGERS.next);
    this.currentStep = stepCount >= 0 && targetStep >= stepCount ? undefined : targetStep;
  }

  apply(values) {
    if (!values || !this.viewModel) return;
    for (const key of Object.keys(values)) {
      this.applyValue(exactVmName(key), values[key]);
    }
  }

  applyValue(name, value) {
    if (!this.viewModel) return false;
    const type = VM_TYPES[name];
    let item = null;
    try {
      if (type === "string" && this.viewModel.string && (item = this.viewModel.string(name))) {
        item.value = String(value);
        return true;
      }
      if (type === "number" && this.viewModel.number && (item = this.viewModel.number(name))) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          item.value = numeric;
          return true;
        }
      }
      if (type === "boolean" && this.viewModel.boolean && (item = this.viewModel.boolean(name))) {
        item.value = String(value).toLowerCase() === "true" || value === true || value === 1 || String(value).toLowerCase() === "yes";
        return true;
      }
      if (type === "color" && this.viewModel.color && (item = this.viewModel.color(name))) {
        const color = toColor32(value);
        if (color != null) {
          item.value = color;
          return true;
        }
      }
      if (type === "trigger" && (value === true || String(value) === "true" || String(value) === "1")) {
        return this.fireVmTrigger(name);
      }
      if (type === "image" && this.viewModel.image) {
        setImageFromSource(this.viewModel, name, value);
        return true;
      }
    } catch (_) {}
    return false;
  }

  fireVmTrigger(name) {
    if (!name || !this.viewModel) return false;
    try {
      const trigger = this.viewModel.trigger ? this.viewModel.trigger(name) : null;
      if (!trigger) return false;
      if (typeof trigger.fire === "function") { trigger.fire(); return true; }
      if (typeof trigger.trigger === "function") { trigger.trigger(); return true; }
      if (typeof trigger === "object" && "value" in trigger) {
        try { trigger.value = true; return true; } catch (_) {}
      }
    } catch (_) {}
    return false;
  }
}
`;
}

export function buildOGrafFiles(schema: RiveSchema, options: OGrafOptions): OGrafFile[] {
  const mainFilename = normalizeOGrafMainFilename(options.mainFilename, options.name);
  const manifestName = defaultOGrafManifestFilename(mainFilename, options.name);
  return [
    {
      filename: manifestName,
      blob: new Blob([buildOGrafManifest(schema, options)], { type: "application/json" }),
    },
    {
      filename: mainFilename,
      blob: new Blob([buildOGrafComponent(schema, options)], { type: "text/javascript" }),
    },
  ];
}

export function defaultOGrafId(baseName: string): string {
  return `io.github.awils27.${slugify(baseName)}`;
}

export function defaultOGrafMainFilename(baseName: string): string {
  return `${slugify(baseName)}.js`;
}
