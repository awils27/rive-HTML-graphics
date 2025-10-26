// public/js/rive-introspect.mjs
// Uses global "rive" (from @rive-app/canvas on the page)

// Get artboards + state machines without creating a live renderer
export async function inspectContents(src) {
  if (!rive?.Rive?.contents) {
    throw new Error("Rive.contents() not available; update @rive-app/canvas.");
  }
  // Accept Blob/URL string
  const content = await rive.Rive.contents({ src });
  // Normalize
  const artboards = (content?.artboards || []).map(a => ({
    name: a.name,
    stateMachines: (a.stateMachines || []).map(sm => ({ name: sm.name }))
  }));
  return { artboards };
}

// Build a schema with actual default VM values by instantiating once
export async function buildSchema(src, _unusedCanvas, artboard, stateMachine) {
  const info = await rive.Rive.contents({ src });
  const ab = pickArtboard(info, artboard);
  const sm = pickStateMachine(ab, stateMachine);

  // Spin up a headless Rive instance to read VM defaults
  const canvas = document.createElement('canvas'); // not displayed
  let vmDefaults = [];
  await new Promise((resolve) => {
    const r = new rive.Rive({
      src,
      canvas,
      autoplay: false,
      artboard: ab?.name,
      stateMachines: sm?.name,
      autoBind: true,
      onLoad: function(){
        try {
          const vmi = r && r.viewModelInstance ? r.viewModelInstance : null;
          const props = collectVmPropsFromContents(ab);
          vmDefaults = props.map(p => ({
            name: p.name,
            type: p.type,
            value: readVmiValue(vmi, p.name, p.type)
          }));
        } catch(e) {
          vmDefaults = [];
        } finally {
          try { r.cleanup && r.cleanup(); } catch {}
          resolve();
        }
      }
    });
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
  // Rive.contents typically exposes ab.viewModel.properties or similar.
  // Normalize across possible shapes.
  const vm = ab?.viewModel || ab?.viewmodel || ab?.vm || null;
  const arr = vm?.properties || vm?.props || [];
  if (Array.isArray(arr) && arr.length) {
    return arr.map(x => ({ name: x.name, type: normalizeType(x.type) })).filter(Boolean);
  }
  // Fallback: empty (UI will still work; user can map triggers via selects)
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
    // triggers have no default value
    return null;
  } catch { return null; }
}
