import type { OGrafFile, OGrafOptions, RiveSchema, ViewModelProp } from "./types";

const OGRAF_SCHEMA_URL = "https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json";

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

function runtimeScriptUrl(runtime: OGrafOptions["runtime"]): string {
  return runtime === "webgl"
    ? "https://unpkg.com/@rive-app/webgl@2.32.0"
    : "https://unpkg.com/@rive-app/canvas@2.32.0";
}

function schemaTypeForProp(prop: ViewModelProp): string {
  if (prop.type === "number" || prop.type === "boolean" || prop.type === "string") return prop.type;
  if (prop.type === "color" || prop.type === "image") return "string";
  return "boolean";
}

function buildDataSchema(props: ViewModelProp[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const prop of props.filter((item) => item.type !== "trigger")) {
    properties[prop.name] = {
      type: schemaTypeForProp(prop),
      title: prop.name,
    };
  }
  return {
    type: "object",
    properties,
    additionalProperties: true,
  };
}

export function buildOGrafManifest(schema: RiveSchema, options: OGrafOptions): string {
  const triggerProps = schema.viewModelProps.filter((prop) => prop.type === "trigger");
  const manifest = {
    $schema: OGRAF_SCHEMA_URL,
    id: options.id,
    version: options.version || undefined,
    name: options.name,
    description: options.description || undefined,
    author: options.author?.name ? options.author : undefined,
    main: options.mainFilename,
    customActions: triggerProps.map((prop) => ({
      id: actionId(prop.name),
      name: prop.name,
    })),
    supportsRealTime: true,
    supportsNonRealTime: false,
    stepCount: Number.isFinite(options.stepCount) ? options.stepCount : 1,
    schema: buildDataSchema(schema.viewModelProps),
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

  return `const RUNTIME_URL = ${JSON.stringify(runtimeScriptUrl(options.runtime))};
const RIV_BASE64 = ${JSON.stringify(options.embed ? options.base64 || "" : "")};
const RIV_PATH = ${JSON.stringify(options.embed ? "" : options.rivPath || "graphic.riv")};
const ARTBOARD = ${JSON.stringify(schema.artboard || "")};
const STATE_MACHINE = ${JSON.stringify(schema.stateMachine || "")};
const VM_TYPES = ${JSON.stringify(vmTypes, null, 2)};
const VM_INDEX = ${JSON.stringify(vmIndex, null, 2)};
const TRIGGERS = ${JSON.stringify(triggers, null, 2)};
const CUSTOM_ACTIONS = ${JSON.stringify(triggerMap, null, 2)};

let riveRuntimePromise = null;

function loadRiveRuntime() {
  if (globalThis.rive?.Rive) return Promise.resolve(globalThis.rive);
  if (riveRuntimePromise) return riveRuntimePromise;
  riveRuntimePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RUNTIME_URL;
    script.onload = () => globalThis.rive?.Rive ? resolve(globalThis.rive) : reject(new Error("Rive runtime did not initialize"));
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
    if (src == null || src === "" || src === "clear" || src === "none") {
      imageProperty.value = null;
      return;
    }

    const value = String(src);
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
    this.loaded = false;
  }

  async load(params = {}) {
    const runtime = await loadRiveRuntime();
    this.shadowRoot.innerHTML = \`<style>:host{display:block;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style><canvas width="1920" height="1080"></canvas>\`;
    const canvas = this.shadowRoot.querySelector("canvas");
    this.rivUrl = RIV_BASE64 ? base64ToBlobUrl(RIV_BASE64) : RIV_PATH;

    await new Promise((resolve, reject) => {
      this.rive = new runtime.Rive({
        src: this.rivUrl,
        canvas,
        autoplay: false,
        artboard: ARTBOARD || undefined,
        stateMachines: STATE_MACHINE || undefined,
        autoBind: true,
        onLoad: () => {
          try { this.rive?.resizeDrawingSurfaceToCanvas?.(); } catch (_) {}
          this.viewModel = this.rive?.viewModelInstance || null;
          this.apply(params.data || {});
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
    const stepCount = ${JSON.stringify(options.stepCount)};
    const goto = params.goto;
    const delta = params.delta ?? 1;
    const fromStep = this.currentStep == null ? -1 : this.currentStep;
    const targetStep = goto !== undefined ? goto : fromStep + delta;

    try { this.rive?.play?.(); } catch (_) {}
    if (this.currentStep == null && TRIGGERS.in) this.fireVmTrigger(TRIGGERS.in);
    else if (TRIGGERS.next) this.fireVmTrigger(TRIGGERS.next);

    this.currentStep = stepCount >= 0 && targetStep >= stepCount ? undefined : targetStep;
    return { statusCode: 200, currentStep: this.currentStep };
  }

  async stopAction() {
    const fired = TRIGGERS.out ? this.fireVmTrigger(TRIGGERS.out) : false;
    if (!fired) {
      try { this.rive?.stop?.(); } catch (_) {}
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
  const manifestName = options.mainFilename.replace(/\.js$/i, ".ograf.json");
  return [
    {
      filename: manifestName,
      blob: new Blob([buildOGrafManifest(schema, options)], { type: "application/json" }),
    },
    {
      filename: options.mainFilename,
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
