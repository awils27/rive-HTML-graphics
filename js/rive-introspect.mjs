// public/js/rive-introspect.mjs
// Uses the global runtime from the CDN build: globalThis.rive (UMD export)

export async function inspectContents(src) {
  const R = (globalThis && globalThis.rive) ? globalThis.rive : null;
  if (!R || !R.Rive || typeof R.Rive.contents !== 'function') {
    throw new Error(
      "Rive runtime not loaded (or contents() unavailable). " +
      "Make sure the <script src='https://unpkg.com/@rive-app/canvas@2.18.1'></script> " +
      "is included BEFORE your module scripts."
    );
  }
  const content = await R.Rive.contents({ src });
  const artboards = (content?.artboards || []).map(a => ({
    name: a.name,
    stateMachines: (a.stateMachines || []).map(sm => ({ name: sm.name }))
  }));
  return { artboards };
}

export async function buildSchema(src, _unusedCanvas, artboard, stateMachine) {
  const R = (globalThis && globalThis.rive) ? globalThis.rive : null;
  if (!R || !R.Rive) {
    throw new Error("Rive runtime not loaded. Include the @rive-app/canvas script tag first.");
  }

  // Prefer fast, headless contents() if present
  let info = null;
  if (typeof R.Rive.contents === 'function') {
    try { info = await R.Rive.contents({ src }); } catch {}
  }

  const ab = info ? pickArtboard(info, artboard) : (artboard ? { name: artboard } : null);
  const sm = info ? pickStateMachine(ab, stateMachine) : (stateMachine ? { name: stateMachine } : null);

  // Spin up an offscreen instance to read ViewModel defaults
  const canvas = document.createElement('canvas');
  let vmDefaults = [];

  await new Promise((resolve, reject) => {
    try {
      const r = new R.Rive({
        src,
        canvas,
        autoplay: false,
        artboard: ab?.name,
        stateMachines: sm?.name,
        autoBind: true,
        onLoad: function(){
          try {
            const vmi = r && r.viewModelInstance ? r.viewModelInstance : null;
            const props = info ? collectVmPropsFromContents(ab) : []; // best effort
            vmDefaults = props.map(p => ({
              name: p.name,
              type: p.type,
              value: readVmiValue(vmi, p.name, p.type)
            }));
          } catch (e) {
            vmDefaults = [];
          } finally {
            try { r.cleanup && r.cleanup(); } catch {}
            resolve();
          }
        },
        onError: (e) => { reject(e || new Error("Rive onError")); }
      });
    } catch (e) {
      reject(e);
    }
  });

  return {
    artboard: ab?.name || "",
    stateMachine: sm?.name || "",
    viewModelProps: vmDefaults
  };
}

// helpers
function pickArtboard(info, name) {
  const list = info?.artboards || [];
  if (!list.length) return null;
  if (!name) return list[0];
  return list.find(a => a.name === name) || list[0];
}
function pickStateMachine(ab, name) {
  const list = ab?.stateMachines || [];
  if (!list.length) return null;
  if (!name) return list[0];
  return list.find(sm => sm.name === name) || list[0];
}

function collectVmPropsFromContents(ab) {
  // Normalizes across possible shapes in contents()
  const vm = ab?.viewModel || ab?.viewmodel || ab?.vm || null;
  const arr = vm?.properties || vm?.props || [];
  if (Array.isArray(arr) && arr.length) {
    return arr.map(x => ({ name: x.name, type: normalizeType(x.type) })).filter(Boolean);
  }
  return [];
}

function normalizeType(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("string"))  return "string";
  if (s.includes("number") || s === "float" || s === "double" || s === "int") return "number";
  if (s.includes("bool"))    return "boolean";
  if (s.includes("color"))   return "color";
  if (s.includes("trigger")) return "trigger";
  return null;
}

function readVmiValue(vmi, name, type) {
  if (!vmi || !name || !type) return null;
  try {
    if (type === "string"  && vmi.string)  { const it=vmi.string(name);  return it ? it.value : null; }
    if (type === "number"  && vmi.number)  { const it=vmi.number(name);  return it ? it.value : null; }
    if (type === "boolean" && vmi.boolean) { const it=vmi.boolean(name); return it ? it.value : null; }
    if (type === "color"   && vmi.color)   { const it=vmi.color(name);   return it ? it.value : null; }
    return null;
  } catch { return null; }
}
