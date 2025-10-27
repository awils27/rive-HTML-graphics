// public/js/rive-introspect.mjs
// Works with the UMD runtime on window/globalThis as injected by:
// <script src="https://unpkg.com/@rive-app/canvas@2.32.0"></script>

function getRiveGlobal() {
  const R = (typeof globalThis !== "undefined" && globalThis.rive) ? globalThis.rive : null;
  if (!R || !R.Rive) {
    throw new Error(
      "Rive runtime not loaded. Include the @rive-app/canvas script BEFORE your module scripts."
    );
  }
  return R;
}

function ensureCanvas(canvas) {
  return (canvas && canvas.getContext) ? canvas : document.createElement("canvas");
}

function coerceVMValue(type, raw) {
  try {
    switch (String(type).toLowerCase()) {
      case "string":  return (raw == null) ? "" : String(raw);
      case "number":  return (raw == null) ? 0 : Number(raw);
      case "boolean": return !!raw;
      case "color":   {
        if (raw == null) return 0;
        const n = Number(raw);
        if (Number.isFinite(n)) return n >>> 0;
        const s = String(raw).trim();
        if (s[0] === "#" && (s.length === 7 || s.length === 9)) {
          return (parseInt(s.slice(1), 16) >>> 0);
        }
        return 0;
      }
      case "trigger": return null;
      case "image":   return null; // images are runtime-set; default is null
      default:        return raw;
    }
  } catch {
    return raw;
  }
}

// Inspect top-level contents by instantiating once.
// `src` can be a URL, blob:, or file path the runtime can fetch.
export async function inspectContents(src, canvas) {
  const { Rive } = getRiveGlobal();
  const cv = ensureCanvas(canvas);

  return new Promise((resolve, reject) => {
    let r = null;
    try {
      r = new Rive({
        src,
        canvas: cv,
        autoplay: false,
        onLoad() {
          Promise.resolve(
            typeof r.contents === 'function' ? r.contents() : r.contents
          ).then((data) => {
            try { resolve(data); }
            finally { try { r.cleanup && r.cleanup(); } catch {} }
          }).catch((e) => {
            try { r && r.cleanup && r.cleanup(); } catch {}
            reject(e || new Error("Failed to read Rive contents()"));
          });
        },
        onLoadError(e) {
          try { r && r.cleanup && r.cleanup(); } catch {}
          reject(e || new Error("Failed to load Rive file"));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Build a ViewModel-only schema (artboard + state machine + default values).
export async function buildSchema(src, canvas, artboard, stateMachine) {
  const { Rive } = getRiveGlobal();
  const cv = ensureCanvas(canvas);

  return new Promise((resolve, reject) => {
    let r = null;
    try {
      r = new Rive({
        src,
        canvas: cv,
        autoplay: false,
        artboard: artboard || undefined,
        stateMachines: stateMachine || undefined,
        autoBind: true,
        onLoad() {
          let viewModelProps = [];
          try {
            const vm  = (typeof r.defaultViewModel === "function") ? r.defaultViewModel() : null;
            const vmi = r.viewModelInstance || null;

            const props = vm?.properties || []; // [{name, type}, ...]
            viewModelProps = Array.isArray(props)
              ? props.map(p => {
                  let raw = null;
                  try {
                    if      (p.type === "string")  raw = vmi?.string(p.name)?.value;
                    else if (p.type === "number")  raw = vmi?.number(p.name)?.value;
                    else if (p.type === "boolean") raw = vmi?.boolean(p.name)?.value;
                    else if (p.type === "color")   raw = vmi?.color(p.name)?.value;
                    else if (p.type === "image")   raw = null; // no static default
                  } catch {}
                  return { name: p.name, type: p.type, value: coerceVMValue(p.type, raw) };
                })
              : [];
          } catch {
            viewModelProps = [];
          }

          resolve({ artboard: artboard || "", stateMachine: stateMachine || "", viewModelProps });
          try { r.cleanup && r.cleanup(); } catch {}
        },
        onLoadError(e) {
          try { r && r.cleanup && r.cleanup(); } catch {}
          reject(e || new Error("Failed to load Rive file"));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}
