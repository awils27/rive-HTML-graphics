import { describe, expect, it } from "vitest";
import { buildTemplate } from "./template-builders";
import type { RiveSchema } from "./types";

const schema: RiveSchema = {
  artboard: "Lower Third",
  stateMachine: "Main SM",
  viewModelProps: [
    { name: "Title", type: "string", value: "Hello" },
    { name: "Score", type: "number", value: 7 },
    { name: "Show", type: "boolean", value: true },
    { name: "Accent", type: "color", value: 0xff336699 },
    { name: "Headshot", type: "image", value: null },
    { name: "Animate In", type: "trigger", value: null },
  ],
};

describe("buildTemplate", () => {
  it("builds an embedded canvas template with schema mappings and triggers", () => {
    const html = buildTemplate(schema, {
      runtime: "canvas",
      embed: true,
      base64: "abc123",
      casparTriggers: { in: "Animate In", out: "Animate Out", next: null },
    });

    expect(html).toContain("https://unpkg.com/@rive-app/canvas@2.32.0");
    expect(html).toContain('<script type="application/octet-stream" id="riv-b64">abc123</script>');
    expect(html).toContain('"Lower Third"');
    expect(html).toContain('"Main SM"');
    expect(html).toContain('"Title":"string"');
    expect(html).toContain('"Animate In":"trigger"');
    expect(html).toContain('"in":"Animate In"');
    expect(html).toContain("window.update = realUpdate");
    expect(html).toContain("setImageFromSource");
  });

  it("builds an external webgl template with a riv path", () => {
    const html = buildTemplate(schema, {
      runtime: "webgl",
      embed: false,
      rivPath: "lower-third.riv",
      casparTriggers: {},
    });

    expect(html).toContain("https://unpkg.com/@rive-app/webgl@2.32.0");
    expect(html).toContain('"lower-third.riv"');
    expect(html).toContain('params.get("riv") || DEF.riv');
    expect(html).toContain('<script type="application/octet-stream" id="riv-b64"></script>');
  });

  it("escapes embedded base64 script-closing text", () => {
    const html = buildTemplate(schema, {
      runtime: "canvas",
      embed: true,
      base64: "abc</script>def",
      casparTriggers: {},
    });

    expect(html).toContain("abc<\\/script>def");
    expect(html).not.toContain("abc</script>def");
  });
});
