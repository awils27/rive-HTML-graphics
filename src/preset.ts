import type { PresetXmlOptions, RiveSchema, ViewModelProp } from "./types";
import { downloadBlob } from "./utils";

function xml(value: unknown): string {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function valueForPreset(prop: ViewModelProp): string {
  const { type, value } = prop;
  if (value == null) return "";
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") return String(value);
  if (type === "color") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const rgb = (numeric & 0xffffff) >>> 0;
      return `#${rgb.toString(16).padStart(6, "0").toUpperCase()}`;
    }
    return String(value);
  }
  return String(value);
}

export function buildCasparClientPresetXml(
  schema: RiveSchema,
  htmlFilename: string,
  opts: PresetXmlOptions = {},
): string {
  const layer = Number(opts.layer ?? 20) || 20;
  const sendAsJson = opts.sendAsJson !== false;
  const nameNoExt = String(htmlFilename || "template.html").replace(/\.html$/i, "");
  const label = opts.label ?? nameNoExt;

  const rows = schema.viewModelProps
    .filter((prop) => prop.type !== "trigger")
    .map(
      (prop) => `        <componentdata>
          <id>${xml(prop.name)}</id>
          <value>${xml(valueForPreset(prop))}</value>
        </componentdata>`,
    )
    .join("\n");

  const templatedata = rows
    ? `\n      <templatedata>\n${rows}\n      </templatedata>`
    : "\n      <templatedata />";

  return `<?xml version="1.0"?>
<items>
  <item>
    <type>TEMPLATE</type>
    <label>${xml(label)}</label>
    <name>${xml(nameNoExt)}</name>
    <flashlayer>${layer}</flashlayer>
    <invoke></invoke>
    <usestoreddata>false</usestoreddata>
    <useuppercasedata>false</useuppercasedata>
    <triggeronnext>false</triggeronnext>
    <sendasjson>${sendAsJson ? "true" : "false"}</sendasjson>${templatedata}
    <color>Transparent</color>
  </item>
</items>
`;
}

export function downloadCasparClientPresetXml(
  schema: RiveSchema,
  htmlFilename: string,
  opts: PresetXmlOptions = {},
): void {
  const presetXml = buildCasparClientPresetXml(schema, htmlFilename, opts);
  const outName = `${String(htmlFilename || "template.html").replace(/\.html$/i, "")}.xml`;
  downloadBlob(new Blob([presetXml], { type: "application/xml" }), outName);
}
