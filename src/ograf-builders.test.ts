import { describe, expect, it } from "vitest";
import { buildOGrafComponent, buildOGrafFiles, buildOGrafManifest, defaultOGrafId } from "./ograf-builders";
import type { OGrafOptions, RiveSchema } from "./types";

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
    expect(manifest.schema.properties.Title.type).toBe("string");
    expect(manifest.schema.properties.Score.type).toBe("number");
    expect(manifest.schema.properties.Visible.type).toBe("boolean");
    expect(manifest.schema.properties.Accent.type).toBe("string");
    expect(manifest.schema.properties.Headshot.type).toBe("string");
    expect(manifest.schema.properties["Animate In"]).toBeUndefined();
  });

  it("builds a Web Component class with OGraf lifecycle methods and Rive settings", () => {
    const component = buildOGrafComponent(schema, options);

    expect(component).toContain("export default class RiveOGrafGraphic extends HTMLElement");
    expect(component).toContain("async load(params = {})");
    expect(component).toContain("async dispose()");
    expect(component).toContain("async playAction(params = {})");
    expect(component).toContain("async stopAction()");
    expect(component).toContain("async updateAction(params = {})");
    expect(component).toContain("async customAction(params = {})");
    expect(component).toContain('"Main Artboard"');
    expect(component).toContain('"Controller"');
    expect(component).toContain('"Animate In"');
    expect(component).toContain("abc123");
    expect(component).toContain("https://unpkg.com/@rive-app/canvas@2.32.0");
  });

  it("builds manifest and JS file blobs", () => {
    const files = buildOGrafFiles(schema, options);

    expect(files.map((file) => file.filename)).toEqual(["lower-third.ograf.json", "lower-third.js"]);
    expect(files[0]?.blob.type).toBe("application/json");
    expect(files[1]?.blob.type).toBe("text/javascript");
  });

  it("creates stable default ids", () => {
    expect(defaultOGrafId("My Lower Third.riv")).toBe("io.github.awils27.my-lower-third");
  });
});
