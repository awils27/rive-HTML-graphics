import { describe, expect, it } from "vitest";
import {
  buildOGrafComponent,
  buildOGrafFiles,
  buildOGrafManifest,
  defaultOGrafId,
  defaultOGrafManifestFilename,
  normalizeOGrafId,
  normalizeOGrafMainFilename,
  normalizeOGrafStepCount,
} from "../src/ograf-builders";
import type { OGrafOptions, RiveSchema } from "../src/types";

const schema: RiveSchema = {
  artboard: "Main Artboard",
  stateMachine: "Controller",
  viewModelProps: [
    { name: "Title", type: "string", value: "Hello" },
    { name: "Score", type: "number", value: 12 },
    { name: "Visible", type: "boolean", value: true },
    { name: "Accent", type: "color", value: 0xff00aa00 },
    { name: "Headshot", type: "image", value: null },
    { name: "Animate In", type: "trigger", value: null },
  ],
};

const options: OGrafOptions = {
  id: "io.github.awils27.lower-third",
  name: "Lower Third",
  version: "1.0.0",
  author: { name: "Aiden Wilson" },
  mainFilename: "lower-third.js",
  runtime: "canvas",
  embed: true,
  base64: "abc123",
  stepCount: 1,
  triggers: { in: "Animate In", out: null, next: null },
};

describe("OGraf builders", () => {
  it("builds an OGraf manifest with required fields, data schema, and trigger actions", () => {
    const manifest = JSON.parse(buildOGrafManifest(schema, options));

    expect(manifest.$schema).toBe("https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json");
    expect(manifest.id).toBe("io.github.awils27.lower-third");
    expect(manifest.name).toBe("Lower Third");
    expect(manifest.main).toBe("lower-third.js");
    expect(manifest.supportsRealTime).toBe(true);
    expect(manifest.supportsNonRealTime).toBe(false);
    expect(manifest.stepCount).toBe(1);
    expect(manifest.author).toEqual({ name: "Aiden Wilson" });
    expect(manifest.customActions).toEqual([{ id: "animate-in", name: "Animate In" }]);
    expect(manifest.schema.additionalProperties).toBe(false);
    expect(manifest.schema.properties.Title.type).toBe("string");
    expect(manifest.schema.properties.Title.gddType).toBe("single-line");
    expect(manifest.schema.properties.Title.default).toBe("Hello");
    expect(manifest.schema.properties.Score.type).toBe("number");
    expect(manifest.schema.properties.Score.default).toBe(12);
    expect(manifest.schema.properties.Visible.type).toBe("boolean");
    expect(manifest.schema.properties.Visible.default).toBe(true);
    expect(manifest.schema.properties.Accent.type).toBe("string");
    expect(manifest.schema.properties.Accent.gddType).toBe("color-rrggbb");
    expect(manifest.schema.properties.Accent.pattern).toBe("^#[0-9a-f]{6}$");
    expect(manifest.schema.properties.Accent.default).toBe("#00aa00");
    expect(manifest.schema.properties.Headshot.type).toBe("string");
    expect(manifest.schema.properties.Headshot.gddType).toBe("file-path/image-path");
    expect(manifest.schema.properties.Headshot.default).toBeUndefined();
    expect(manifest.schema.properties["Animate In"]).toBeUndefined();
    expect(manifest.renderRequirements).toEqual([
      {
        resolution: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        frameRate: { ideal: 50 },
        accessToPublicInternet: { ideal: true },
      },
    ]);
  });

  it("builds a Web Component class with OGraf lifecycle methods and Rive settings", () => {
    const component = buildOGrafComponent(schema, options);

    expect(component).toContain("export default class RiveOGrafGraphic extends HTMLElement");
    expect(component).toContain("async load(params = {})");
    expect(component).toContain("async dispose()");
    expect(component).toContain("async playAction(params = {})");
    expect(component).toContain("async stopAction(params = {})");
    expect(component).toContain("async updateAction(params = {})");
    expect(component).toContain("async customAction(params = {})");
    expect(component).toContain("async goToTime(params = {})");
    expect(component).toContain("async setActionsSchedule(params = {})");
    expect(component).toContain('"Main Artboard"');
    expect(component).toContain('"Controller"');
    expect(component).toContain('"Animate In"');
    expect(component).toContain("abc123");
    expect(component).toContain("https://unpkg.com/@rive-app/canvas@2.32.0");
    expect(component).toContain("if (!value) return;");
    expect(component).toContain("fetch(resolveModuleUrl(value), { cache: \"no-store\" })");
  });

  it("can point generated components at bundled runtime assets", () => {
    const bundledOptions: OGrafOptions = {
      ...options,
      embed: false,
      base64: "",
      rivPath: "lower-third.riv",
      runtimeScriptUrl: "rive-runtime.js",
      runtimeWasmUrl: "rive.wasm",
      runtimeWasmFallbackUrl: "rive_fallback.wasm",
    };
    const component = buildOGrafComponent(schema, bundledOptions);
    const manifest = JSON.parse(buildOGrafManifest(schema, bundledOptions));

    expect(component).toContain('const RUNTIME_URL = "rive-runtime.js"');
    expect(component).toContain('const RUNTIME_WASM_URL = "rive.wasm"');
    expect(component).toContain('const RUNTIME_WASM_FALLBACK_URL = "rive_fallback.wasm"');
    expect(component).toContain('const RIV_PATH = "lower-third.riv"');
    expect(component).toContain("loader.setWasmUrl(wasmUrl)");
    expect(component).toContain("resolveModuleUrl(RIV_PATH)");
    expect(manifest.renderRequirements[0].accessToPublicInternet).toEqual({ ideal: false });
  });

  it("enables non-real-time manifest support when a fallback timeline is selected", () => {
    const manifest = JSON.parse(buildOGrafManifest(schema, { ...options, fallbackTimeline: "Offline Render" }));

    expect(manifest.supportsNonRealTime).toBe(true);
  });

  it("builds non-real-time fallback timeline seeking into the component", () => {
    const component = buildOGrafComponent(schema, { ...options, fallbackTimeline: "Offline Render" });

    expect(component).toContain('const FALLBACK_TIMELINE = "Offline Render"');
    expect(component).toContain('this.renderType = params.renderType === "non-realtime" ? "non-realtime" : "realtime"');
    expect(component).toContain('const useFallbackTimeline = this.renderType === "non-realtime" && FALLBACK_TIMELINE');
    expect(component).toContain("animations: useFallbackTimeline ? FALLBACK_TIMELINE : undefined");
    expect(component).toContain("stateMachines: useFallbackTimeline ? undefined : STATE_MACHINE || undefined");
    expect(component).toContain("this.rive.pause?.(FALLBACK_TIMELINE)");
    expect(component).toContain("this.rive.scrub(FALLBACK_TIMELINE, timestamp / 1000)");
    expect(component).toContain("return { statusCode: 200 };");
    expect(component).not.toContain("currentTime");
    expect(component).toContain("applyScheduledActions(timestamp)");
    expect(component).toContain("applyScheduledPlay(params)");
  });

  it("builds manifest and JS file blobs", () => {
    const files = buildOGrafFiles(schema, options);

    expect(files.map((file) => file.filename)).toEqual(["lower-third.ograf.json", "lower-third.js"]);
    expect(files[0]?.blob.type).toBe("application/json");
    expect(files[1]?.blob.type).toBe("text/javascript");
  });

  it("normalizes OGraf fields that are constrained by the spec", () => {
    expect(normalizeOGrafId("bad/id")).toBe("bad.id");
    expect(normalizeOGrafStepCount(2.9)).toBe(2);
    expect(normalizeOGrafStepCount(-5)).toBe(-1);
    expect(normalizeOGrafMainFilename("lower-third")).toBe("lower-third.js");
    expect(defaultOGrafManifestFilename("lower-third")).toBe("lower-third.ograf.json");

    const manifest = JSON.parse(
      buildOGrafManifest(schema, {
        ...options,
        id: "bad/id",
        mainFilename: "lower-third",
        stepCount: -5,
      }),
    );

    expect(manifest.id).toBe("bad.id");
    expect(manifest.main).toBe("lower-third.js");
    expect(manifest.stepCount).toBe(-1);
  });

  it("creates stable default ids", () => {
    expect(defaultOGrafId("My Lower Third.riv")).toBe("io.github.awils27.my-lower-third");
  });
});
