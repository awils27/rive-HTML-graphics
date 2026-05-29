import { describe, expect, it } from "vitest";
import { buildCasparClientPresetXml } from "../src/preset";
import type { RiveSchema } from "../src/types";

describe("buildCasparClientPresetXml", () => {
  it("escapes XML values, skips triggers, and respects options", () => {
    const schema: RiveSchema = {
      artboard: "Art",
      stateMachine: "SM",
      viewModelProps: [
        { name: "Title & Strap", type: "string", value: "A < B" },
        { name: "Enabled", type: "boolean", value: true },
        { name: "Accent", type: "color", value: 0xff336699 },
        { name: "Animate", type: "trigger", value: null },
      ],
    };

    const xml = buildCasparClientPresetXml(schema, "caspar-test.html", {
      layer: 42,
      sendAsJson: false,
      label: "Aiden's <Template>",
    });

    expect(xml).toContain("<flashlayer>42</flashlayer>");
    expect(xml).toContain("<sendasjson>false</sendasjson>");
    expect(xml).toContain("<label>Aiden&apos;s &lt;Template&gt;</label>");
    expect(xml).toContain("<id>Title &amp; Strap</id>");
    expect(xml).toContain("<value>A &lt; B</value>");
    expect(xml).toContain("<value>true</value>");
    expect(xml).toContain("<value>#336699</value>");
    expect(xml).not.toContain("Animate");
  });
});
