import { coerceVMValue } from './utils.mjs';

// Read top-level contents from a Blob URL (.riv)
export async function inspectContents(blobURL, canvas) {
  return new Promise((resolve, reject) => {
    const r = new rive.Rive({
      src: blobURL,
      canvas,
      autoplay: false,
      onLoad() {
        try { resolve(r.contents); }
        finally { try { r.cleanup(); } catch {} }
      },
      onLoadError(e) { reject(e); }
    });
  });
}

// Build a ViewModel-only schema (artboard + state machine) with default values
export async function buildSchema(blobURL, canvas, artboard, stateMachine) {
  return new Promise((resolve, reject) => {
    const r = new rive.Rive({
      src: blobURL,
      canvas,
      autoplay: false,
      artboard,
      stateMachines: stateMachine || undefined,
      autoBind: true,
      onLoad() {
        let viewModelProps = [];
        try {
          const vm  = r.defaultViewModel?.();
          const vmi = r.viewModelInstance; // read defaults from instance
          viewModelProps = vm?.properties
            ? vm.properties.map(p => {
                let raw;
                try {
                  if      (p.type === 'string')  raw = vmi?.string(p.name)?.value;
                  else if (p.type === 'number')  raw = vmi?.number(p.name)?.value;
                  else if (p.type === 'boolean') raw = vmi?.boolean(p.name)?.value;
                  else if (p.type === 'color')   raw = vmi?.color(p.name)?.value;
                  else if (p.type === 'trigger') raw = null;
                } catch {}
                return { name: p.name, type: p.type, value: coerceVMValue(p.type, raw) };
              })
            : [];
        } catch {}
        resolve({ artboard, stateMachine, viewModelProps });
        try { r.cleanup(); } catch {}
      },
      onLoadError(e) { reject(e); }
    });
  });
}