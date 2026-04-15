import type {
  RiveContents,
  RiveSchema,
  ViewModelProp,
  ViewModelPropType,
  ViewModelValue,
} from "./types";

function getRiveGlobal(): RiveGlobal {
  const runtime = globalThis.rive ?? null;
  if (!runtime?.Rive) {
    throw new Error(
      "Rive runtime not loaded. Include the @rive-app/canvas script BEFORE your module scripts.",
    );
  }
  return runtime;
}

function ensureCanvas(canvas?: HTMLCanvasElement): HTMLCanvasElement {
  return canvas?.getContext ? canvas : document.createElement("canvas");
}

function normalizePropType(type: string): ViewModelPropType | null {
  const lowered = type.toLowerCase();
  if (
    lowered === "string" ||
    lowered === "number" ||
    lowered === "boolean" ||
    lowered === "color" ||
    lowered === "trigger" ||
    lowered === "image"
  ) {
    return lowered;
  }
  return null;
}

function coerceVmValue(type: string, raw: unknown): ViewModelValue {
  try {
    switch (type.toLowerCase()) {
      case "string":
        return raw == null ? "" : String(raw);
      case "number":
        return raw == null ? 0 : Number(raw);
      case "boolean":
        return Boolean(raw);
      case "color": {
        if (raw == null) return 0;
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) return numeric >>> 0;
        const stringValue = String(raw).trim();
        if (stringValue[0] === "#" && (stringValue.length === 7 || stringValue.length === 9)) {
          return parseInt(stringValue.slice(1), 16) >>> 0;
        }
        return 0;
      }
      case "trigger":
      case "image":
        return null;
      default:
        return raw == null ? null : String(raw);
    }
  } catch {
    return null;
  }
}

function cleanupRive(instance: RiveInstance | null): void {
  try {
    instance?.cleanup?.();
  } catch {
    // Best-effort cleanup only.
  }
}

export async function inspectContents(
  src: string,
  canvas?: HTMLCanvasElement,
): Promise<RiveContents> {
  const { Rive } = getRiveGlobal();
  const targetCanvas = ensureCanvas(canvas);

  return new Promise((resolve, reject) => {
    let riveInstance: RiveInstance | null = null;
    try {
      riveInstance = new Rive({
        src,
        canvas: targetCanvas,
        autoplay: false,
        onLoad() {
          Promise.resolve(
            typeof riveInstance?.contents === "function"
              ? riveInstance.contents()
              : riveInstance?.contents,
          )
            .then((data) => {
              resolve((data ?? {}) as RiveContents);
            })
            .catch((error: unknown) => {
              reject(error || new Error("Failed to read Rive contents()"));
            })
            .finally(() => cleanupRive(riveInstance));
        },
        onLoadError(error?: unknown) {
          cleanupRive(riveInstance);
          reject(error || new Error("Failed to load Rive file"));
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function buildSchema(
  src: string,
  canvas: HTMLCanvasElement | undefined,
  artboard: string,
  stateMachine: string,
): Promise<RiveSchema> {
  const { Rive } = getRiveGlobal();
  const targetCanvas = ensureCanvas(canvas);

  return new Promise((resolve, reject) => {
    let riveInstance: RiveInstance | null = null;
    try {
      riveInstance = new Rive({
        src,
        canvas: targetCanvas,
        autoplay: false,
        artboard: artboard || undefined,
        stateMachines: stateMachine || undefined,
        autoBind: true,
        onLoad() {
          let viewModelProps: ViewModelProp[] = [];
          try {
            const viewModel = riveInstance?.defaultViewModel?.() ?? null;
            const viewModelInstance = riveInstance?.viewModelInstance ?? null;
            const props = viewModel?.properties ?? [];

            viewModelProps = Array.isArray(props)
              ? props.flatMap((prop) => {
                  const propType = normalizePropType(prop.type);
                  if (!propType) return [];

                  let raw: unknown = null;
                  try {
                    if (propType === "string") raw = viewModelInstance?.string?.(prop.name)?.value;
                    else if (propType === "number") raw = viewModelInstance?.number?.(prop.name)?.value;
                    else if (propType === "boolean") raw = viewModelInstance?.boolean?.(prop.name)?.value;
                    else if (propType === "color") raw = viewModelInstance?.color?.(prop.name)?.value;
                  } catch {
                    raw = null;
                  }

                  return [{ name: prop.name, type: propType, value: coerceVmValue(propType, raw) }];
                })
              : [];
          } catch {
            viewModelProps = [];
          }

          resolve({ artboard: artboard || "", stateMachine: stateMachine || "", viewModelProps });
          cleanupRive(riveInstance);
        },
        onLoadError(error?: unknown) {
          cleanupRive(riveInstance);
          reject(error || new Error("Failed to load Rive file"));
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}
