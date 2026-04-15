import type { CasparTriggers, Runtime, ViewModelProp } from "./types";

export interface TemplateRuntimeConfig {
  runtime: Runtime;
  embed: boolean;
  rivPath: string;
  artboard: string;
  stateMachine: string;
  viewModelProps: ViewModelProp[];
  casparTriggers: CasparTriggers;
  vmDefaults: Record<string, string | number | boolean> | null;
}

function esc(value: string): string {
  return String(value).replace(/["\\]/g, (match) => `\\${match}`);
}

function vmIndexLiteral(props: ViewModelProp[]): string {
  const entries = props.map((prop) => `"${esc(prop.name.toLowerCase())}":"${esc(prop.name)}"`);
  return `{${entries.join(",")}}`;
}

function vmTypesLiteral(props: ViewModelProp[]): string {
  const entries = props.map((prop) => `"${esc(prop.name)}":"${prop.type}"`);
  return `{${entries.join(",")}}`;
}

export function buildTemplateRuntimeScript(config: TemplateRuntimeConfig): string {
  const vmIndex = vmIndexLiteral(config.viewModelProps);
  const vmTypes = vmTypesLiteral(config.viewModelProps);
  const triggers = JSON.stringify({
    in: config.casparTriggers.in || null,
    out: config.casparTriggers.out || null,
    next: config.casparTriggers.next || null,
  });
  const defaults = JSON.stringify(config.vmDefaults ?? {});

  return `
(function(){
  "use strict";

  const VM_INDEX = ${vmIndex};
  const VM_TYPES = ${vmTypes};
  const TRIGGERS = ${triggers};
  const VM_DEFAULTS = ${defaults};
  const DEF = {
    riv: ${config.embed ? '""' : JSON.stringify(config.rivPath)},
    artboard: ${JSON.stringify(config.artboard || "Artboard")},
    sm: ${JSON.stringify(config.stateMachine || "State Machine 1")}
  };

  const state = {
    r: null,
    vmi: null,
    hasUpdatedOnce: false,
    firstPlayPending: false,
    firstPlayTimer: null,
    firstPlayWaitMs: 250,
    pendingUpdates: []
  };

  function toColor32(raw){
    if (raw == null) return null;
    const value = String(raw).trim();
    if (value.charAt(0) === "#") {
      return (value.length === 7 ? (0xFF000000 | parseInt(value.slice(1), 16)) >>> 0 : parseInt(value.slice(1), 16) >>> 0);
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric >>> 0 : null;
  }

  function getEmbeddedBase64(){
    const element = document.getElementById("riv-b64");
    return element ? element.textContent || "" : "";
  }

  function base64ToBlobUrl(base64){
    const binary = atob(base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    return URL.createObjectURL(blob);
  }

  function fireVmTrigger(name){
    if (!name || !state.vmi) return false;
    try {
      const trigger = state.vmi.trigger ? state.vmi.trigger(name) : null;
      if (!trigger) return false;
      if (typeof trigger.fire === "function") { trigger.fire(); return true; }
      if (typeof trigger.trigger === "function") { trigger.trigger(); return true; }
      if (typeof trigger === "object" && "value" in trigger) {
        try { trigger.value = true; return true; } catch (_) {}
      }
    } catch (_) {}
    return false;
  }

  function decodeAndSetImage(imageProperty, bytes){
    try {
      rive.decodeImage(bytes)
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

  function setImageFromSource(propName, src) {
    if (!state.vmi) return;
    try {
      const imageProperty = state.vmi.image ? state.vmi.image(propName) : null;
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

  function applyValue(name, value){
    if (!state.vmi) return false;
    const type = VM_TYPES[name];
    let item = null;

    try {
      if (type === "string" && state.vmi.string && (item = state.vmi.string(name))) {
        item.value = String(value);
        return true;
      }
      if (type === "number" && state.vmi.number && (item = state.vmi.number(name))) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          item.value = numeric;
          return true;
        }
      }
      if (type === "boolean" && state.vmi.boolean && (item = state.vmi.boolean(name))) {
        item.value = String(value).toLowerCase() === "true" || value === true || value === 1 || String(value).toLowerCase() === "yes";
        return true;
      }
      if (type === "color" && state.vmi.color && (item = state.vmi.color(name))) {
        const color = toColor32(value);
        if (color != null) {
          item.value = color;
          return true;
        }
      }
      if (type === "image" && state.vmi.image) {
        setImageFromSource(name, String(value));
        return true;
      }
      if (type === "trigger" && (value === true || String(value) === "true" || String(value) === "1")) {
        return fireVmTrigger(name);
      }
    } catch (_) {}

    try {
      if (state.vmi.string && (item = state.vmi.string(name))) { item.value = String(value); return true; }
    } catch (_) {}
    try {
      if (state.vmi.number && (item = state.vmi.number(name))) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) { item.value = numeric; return true; }
      }
    } catch (_) {}
    try {
      if (state.vmi.boolean && (item = state.vmi.boolean(name))) {
        item.value = String(value).toLowerCase() === "true" || value === true || value === 1 || String(value).toLowerCase() === "yes";
        return true;
      }
    } catch (_) {}
    try {
      if (state.vmi.color && (item = state.vmi.color(name))) {
        const color = toColor32(value);
        if (color != null) { item.value = color; return true; }
      }
    } catch (_) {}
    try {
      if (state.vmi.image && state.vmi.image(name)) {
        setImageFromSource(name, String(value));
        return true;
      }
    } catch (_) {}
    if (value === true || String(value) === "true" || String(value) === "1") {
      try { return fireVmTrigger(name); } catch (_) {}
    }
    return false;
  }

  function exactVmName(name){
    if (VM_TYPES[name]) return name;
    const indexed = VM_INDEX[String(name).toLowerCase()];
    return indexed || name;
  }

  function apply(values){
    if (!values || !state.vmi) return;
    for (const key of Object.keys(values)) {
      applyValue(exactVmName(key), values[key]);
    }
  }

  function applyFromUrl(){
    if (!state.vmi) return;
    const params = new URL(window.location.href).searchParams;
    for (const [key, value] of params.entries()) {
      if (!key.startsWith("vm.")) continue;
      applyValue(exactVmName(key.slice(3)), value);
    }
  }

  function textByTag(root, tag){
    try {
      const element = root.getElementsByTagName(tag)[0];
      return element ? element.textContent || "" : "";
    } catch (_) {
      return "";
    }
  }

  function parseTemplateDataXml(raw){
    try {
      const doc = new DOMParser().parseFromString(String(raw), "application/xml");
      const out = {};
      let nodes = doc.getElementsByTagName("componentData");
      if (!nodes || !nodes.length) nodes = doc.getElementsByTagName("componentdata");
      for (const node of nodes) {
        const id = node.getAttribute("id") || textByTag(node, "id");
        const dataElement = node.getElementsByTagName("data")[0] || null;
        const value = dataElement ? dataElement.getAttribute("value") || dataElement.textContent || "" : textByTag(node, "value");
        if (id) out[id] = value == null ? "" : String(value);
      }
      return out;
    } catch (_) {
      return {};
    }
  }

  function stripBomAndTrim(value){
    return String(value || "").replace(/^\\uFEFF/, "").trim();
  }

  function unwrapIfQuoted(value){
    if (value.length >= 2 && ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'"))) {
      return value.slice(1, -1);
    }
    return value;
  }

  function escapeBareNewlinesInJson(value){
    return String(value).replace(/\\r?\\n/g, "\\\\n");
  }

  function normalizeCasparJsonObject(value){
    if (!value || typeof value !== "object") return {};
    const templateData = value.templateData || value.templatedata;
    if (templateData) {
      const rows = templateData.componentData || templateData.componentdata || [];
      const map = {};
      for (const row of rows) {
        const id = row.id || row.componentId || row.name;
        const val = (row.data && (row.data.value != null ? row.data.value : row.data.text)) || row.value || "";
        if (id) map[id] = String(val);
      }
      return map;
    }
    return value;
  }

  function parseCasparJsonStrict(value){
    const objectValue = typeof value === "string" ? JSON.parse(value) : value;
    return normalizeCasparJsonObject(objectValue);
  }

  function parseCasparJsonLenient(raw){
    try {
      if (typeof raw === "string") return parseCasparJsonStrict(raw);
      return normalizeCasparJsonObject(raw);
    } catch (_) {
      try {
        let value = typeof raw === "string" ? raw : JSON.stringify(raw);
        value = escapeBareNewlinesInJson(unwrapIfQuoted(stripBomAndTrim(value)));
        return parseCasparJsonStrict(value);
      } catch (_) {
        const out = {};
        const fallback = typeof raw === "string" ? raw : "";
        fallback.replace(/[\\r\\n]+/g, " ").replace(/"([^"\\\\]+)"\\s*:\\s*"([^"\\\\]*)"/g, (_match, key, value) => {
          out[key] = value;
          return "";
        });
        return out;
      }
    }
  }

  function doPlayNow(){
    try { if (state.r && state.r.play) state.r.play(); } catch (_) {}
    if (TRIGGERS.in) fireVmTrigger(TRIGGERS.in);
  }

  function realUpdate(raw){
    try {
      if (raw == null) return;
      let objectValue = {};
      if (typeof raw === "string") {
        const value = stripBomAndTrim(raw);
        objectValue = value.replace(/^[\\s\\r\\n]+/, "").charAt(0) === "<"
          ? parseTemplateDataXml(value)
          : parseCasparJsonLenient(value);
      } else if (typeof raw === "object") {
        objectValue = parseCasparJsonLenient(raw);
      }

      if (!state.vmi) {
        state.pendingUpdates.push(objectValue);
        return;
      }

      apply(objectValue);
      state.hasUpdatedOnce = true;
      if (state.firstPlayPending) {
        state.firstPlayPending = false;
        if (state.firstPlayTimer) {
          clearTimeout(state.firstPlayTimer);
          state.firstPlayTimer = null;
        }
        doPlayNow();
      }
    } catch (error) {
      console.error("UPDATE parse error", error);
    }
  }

  window.update = realUpdate;
  window.data = realUpdate;
  window.SetData = realUpdate;
  window.play = function(){
    if (!state.hasUpdatedOnce) {
      state.firstPlayPending = true;
      if (!state.firstPlayTimer) {
        state.firstPlayTimer = setTimeout(() => {
          if (state.firstPlayPending) {
            state.firstPlayPending = false;
            doPlayNow();
          }
        }, state.firstPlayWaitMs);
      }
      return;
    }
    doPlayNow();
  };
  window.next = function(){ if (TRIGGERS.next) fireVmTrigger(TRIGGERS.next); };
  window.stop = function(){
    const fired = TRIGGERS.out ? fireVmTrigger(TRIGGERS.out) : false;
    if (!fired) {
      try { if (state.r && state.r.stop) state.r.stop(); } catch (_) {}
    }
  };
  window.remove = function(){
    try { if (state.r && state.r.cleanup) state.r.cleanup(); } catch (_) {}
  };

  function boot(){
    const canvas = document.getElementById("cg");
    const params = new URL(window.location.href).searchParams;
    const embeddedBase64 = ${config.embed ? "getEmbeddedBase64()" : '""'};
    const riv = ${config.embed ? 'embeddedBase64 ? base64ToBlobUrl(embeddedBase64) : DEF.riv' : 'params.get("riv") || DEF.riv'};
    const artboard = params.get("artboard") || params.get("ab") || (DEF.artboard || undefined);
    const stateMachine = params.get("sm") || params.get("statemachine") || (DEF.sm || undefined);

    try {
      state.r = new rive.Rive({
        src: riv,
        canvas,
        autoplay: false,
        artboard,
        stateMachines: stateMachine,
        autoBind: true,
        onLoad(){
          try { if (state.r && state.r.resizeDrawingSurfaceToCanvas) state.r.resizeDrawingSurfaceToCanvas(); } catch (_) {}
          try { state.vmi = state.r && state.r.viewModelInstance ? state.r.viewModelInstance : null; } catch (_) { state.vmi = null; }

          try { apply(VM_DEFAULTS); } catch (_) {}
          try { applyFromUrl(); } catch (_) {}

          try {
            const earlyQueue = window.__caspar && window.__caspar.q ? window.__caspar.q : [];
            for (const item of earlyQueue) {
              if (item[0] === "update") realUpdate(item[1]);
            }
            if (window.__caspar) window.__caspar.q = [];
          } catch (_) {}

          try {
            if (state.pendingUpdates.length) {
              for (const update of state.pendingUpdates) apply(update);
              state.pendingUpdates.length = 0;
              state.hasUpdatedOnce = true;
            }
          } catch (_) {}

          try {
            window.addEventListener("resize", () => {
              try { if (state.r && state.r.resizeDrawingSurfaceToCanvas) state.r.resizeDrawingSurfaceToCanvas(); } catch (_) {}
            });
          } catch (_) {}
        }
      });
    } catch (error) {
      console.error("Rive boot error", error);
    }
  }

  boot();
})();
`;
}
