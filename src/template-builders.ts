import type { RiveSchema, TemplateOptions } from "./types";
import { buildTemplateRuntimeScript } from "./template-runtime";

function escapeScriptContent(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}

export function buildTemplate(schema: RiveSchema, opts: TemplateOptions): string {
  const runtime = opts.runtime === "webgl" ? "webgl" : "canvas";
  const embed = Boolean(opts.embed);
  const rivBase64 = embed ? opts.base64 || "" : "";
  const rivPath = embed ? "" : opts.rivPath || "./graphics.riv";
  const viewModelProps = Array.isArray(schema.viewModelProps) ? schema.viewModelProps : [];

  const runtimeScript =
    runtime === "webgl"
      ? '<script src="https://unpkg.com/@rive-app/webgl@2.32.0"></script>'
      : '<script src="https://unpkg.com/@rive-app/canvas@2.32.0"></script>';

  const b64Tag = embed
    ? `<script type="application/octet-stream" id="riv-b64">${escapeScriptContent(rivBase64)}</script>`
    : '<script type="application/octet-stream" id="riv-b64"></script>';

  const earlyStub = `
<script>
(function(){
  if (!window.__caspar) window.__caspar = { q: [] };
  const q = window.__caspar.q;
  window.update = function(payload){ q.push(["update", payload]); };
  window.data = window.update;
  window.SetData = window.update;
})();
</script>`;

  const templateRuntime = buildTemplateRuntimeScript({
    runtime,
    embed,
    rivPath,
    artboard: schema.artboard || "",
    stateMachine: schema.stateMachine || "",
    viewModelProps,
    casparTriggers: opts.casparTriggers || {},
    vmDefaults: opts.vmDefaults ?? null,
  });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>CasparCG + Rive</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  html{background:transparent;overflow:hidden}
  body{margin:0}
  #stage{position:absolute;inset:0}
  canvas{width:100vw;height:100vh}
</style>
</head>
<body>
  <div id="stage"><canvas id="cg" width="1920" height="1080"></canvas></div>
  ${b64Tag}
  ${earlyStub}
  ${runtimeScript}
  <script>${templateRuntime}</script>
</body>
</html>`;
}
