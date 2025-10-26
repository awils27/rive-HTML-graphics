// public/js/template-builders.mjs
// One generator for both Caspar + OBS. ES5-safe inline scripts.
// Options:
//   mode: "caspar" | "obs"
//   runtime: "canvas" | "webgl"            (Caspar only; OBS is canvas)
//   embed: true | false                    (embed .riv as Base64)
//   base64: "<raw base64>"                 (required if embed=true)
//   rivPath: "graphics.riv"                (used if embed=false)
//   artboard, stateMachine: string|undefined
//   casparTriggers: { in?, out?, next? }   (Caspar only)
//   timers (OBS): { startMs=0, outAfterMs=-1, clearAfterMs=-1 }
//   vmDefaults: { [name]: string }         (OBS baked defaults)
//   schema.viewModelProps: [{ name, type, value? }...]

export function buildTemplate(schema = {}, opts = {}) {
  const mode = opts.mode || "caspar";
  if (!["caspar", "obs"].includes(mode)) throw new Error("mode must be caspar|obs");
  const runtime = mode === "caspar" ? (opts.runtime || "canvas") : "canvas";

  const artboard = schema.artboard || "";
  const stateMachine = schema.stateMachine || "";
  const vprops = Array.isArray(schema.viewModelProps) ? schema.viewModelProps : [];

  const embed = !!opts.embed;
  const rivBase64 = embed ? (opts.base64 || "") : "";
  const rivPath   = !embed ? (opts.rivPath || "./graphics.riv") : "";

  const casparTriggers = opts.casparTriggers || {};
  const timers = opts.timers || {};
  const startMs = numOr(timers.startMs, 0);
  const outAfterMs = numOr(timers.outAfterMs, -1);
  const clearAfterMs = numOr(timers.clearAfterMs, -1);
  const vmDefaults = opts.vmDefaults && typeof opts.vmDefaults === "object" ? opts.vmDefaults : null;

  const runtimeScript =
    runtime === "webgl"
      ? '<script src="https://unpkg.com/@rive-app/webgl@2.18.1"></script>'
      : '<script src="https://unpkg.com/@rive-app/canvas@2.18.1"></script>';

  const urlSetters = vprops.map(setterLine).filter(Boolean).join("\n      ");
  const vmDefaultsLines = vmDefaults
    ? Object.keys(vmDefaults).map((name) => bakeDefaultLine(name, vmDefaults[name])).join("\n      ")
    : "";

  const rivSourceExpr =
    embed
      ? `RIV_BASE64 ? base64ToBlobUrl(RIV_BASE64) : DEF.riv`
      : `params.get("riv") || DEF.riv`;

  const obsOnly = mode === "obs" ? `
    function scheduleInOut(){
      setTimeout(function(){
        try { if (r && r.play) r.play(); } catch(e){}
        if (trigIn) fireVmTrigger(trigIn);
        if (outAfterMs > 0){
          setTimeout(function(){
            if (trigOut) fireVmTrigger(trigOut); else { try { if (r && r.stop) r.stop(); } catch(e){} }
            if (clearAfterMs > 0){
              setTimeout(function(){ try { if (r && r.cleanup) r.cleanup(); } catch(e){} }, clearAfterMs);
            }
          }, outAfterMs);
        }
      }, Math.max(0, startMs));
    }` : "";

  const casparApi = mode === "caspar" ? `
    // --- XML/JSON UPDATE support ---
    function parseTemplateDataXml(raw){
      try{
        var doc = new DOMParser().parseFromString(String(raw), 'application/xml');
        var out = {};
        var nodes = doc.getElementsByTagName('componentData');
        for (var i=0;i<nodes.length;i++){
          var id = nodes[i].getAttribute('id');
          var data = nodes[i].getElementsByTagName('data')[0];
          var val = data ? (data.getAttribute('value') || data.textContent || '') : '';
          if (id) out[id] = val;
        }
        return out;
      } catch(e){ return {}; }
    }
    window.update = function(raw){
      try {
        var s = (typeof raw === 'string') ? raw.trim() : '';
        if (s && s.charAt(0) === '<') apply(parseTemplateDataXml(s));
        else if (s) apply(JSON.parse(s));
        else if (typeof raw === 'object' && raw) apply(raw);
      } catch(e){ console.error("bad UPDATE payload", e, raw); }
    };
    window.play   = function(){ try { if (r && r.play) r.play(); } catch(e){} ${casparTriggers.in ? `fireVmTrigger(${JSON.stringify(casparTriggers.in)});` : ""} };
    window.next   = function(){ ${casparTriggers.next ? `fireVmTrigger(${JSON.stringify(casparTriggers.next)});` : ""} };
    window.stop   = function(){ var fired = ${casparTriggers.out ? `fireVmTrigger(${JSON.stringify(casparTriggers.out)})` : `false`}; if (!fired) { try { if (r && r.stop) r.stop(); } catch(e){} } };
    window.remove = function(){ try { if (r && r.cleanup) r.cleanup(); } catch(e){} };` : "";

  const obsParams = mode === "obs" ? `
    var trigIn  = params.get("in")  || null;
    var trigOut = params.get("out") || null;
    var startMs    = num(params.get("startMs"), DEF.startMs);
    var outAfterMs = num(params.get("outAfterMs"), DEF.outAfterMs);
    var clearAfterMs = num(params.get("clearAfterMs"), DEF.clearAfterMs);` : "";

  const obsDefaultsObj = mode === "obs" ? `
    var DEF = {
      riv: "./graphics.riv",
      artboard: ${JSON.stringify(artboard || "")},
      sm: ${JSON.stringify(stateMachine || "")},
      startMs: ${startMs},
      outAfterMs: ${outAfterMs},
      clearAfterMs: ${clearAfterMs}
    };` : `
    var DEF = {
      riv: ${JSON.stringify(rivPath)},
      artboard: ${JSON.stringify(artboard || "")},
      sm: ${JSON.stringify(stateMachine || "")}
    };`;

  const applyDefaultsBlock = mode === "obs" && vmDefaultsLines ? `
    function applyBakedDefaults(){ ${vmDefaultsLines} }` : `
    function applyBakedDefaults(){} // no-op`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>${mode === "caspar" ? "CasparCG + Rive" : "OBS Rive Player"}</title>
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
  ${embed ? '<script type="application/octet-stream" id="riv-b64"></script>' : ""}
  ${runtimeScript}
  <script>
  (function(){
    "use strict";
    function num(v, d){ var n = Number(v); return isFinite(n) ? n : d; }
    function numOr(v, d){ return (typeof v === "number" && isFinite(v)) ? v : d; }
    function toColor32(raw){
      if (raw == null) return null;
      var s = String(raw).trim();
      if (s.charAt(0) === "#"){
        return (s.length === 7 ? (0xFF000000 | parseInt(s.slice(1),16)) >>> 0 : (parseInt(s.slice(1),16)) >>> 0);
      }
      var n = Number(s); return isFinite(n) ? (n>>>0) : null;
    }
    function fireVmTrigger(name){
      if (!name || !vmi) return false;
      try {
        var t = vmi.trigger ? vmi.trigger(name) : null;
        if (!t) return false;
        if (typeof t.fire === "function")    { t.fire();    return true; }
        if (typeof t.trigger === "function") { t.trigger(); return true; }
        if (typeof t === "object" && "value" in t) { try { t.value = true; return true; } catch(e){} }
      } catch(e){}
      return false;
    }
    function base64ToBlobUrl(b64){
      var bin = atob(b64 || "");
      var len = bin.length;
      var bytes = new Uint8Array(len);
      for (var i=0;i<len;i++) bytes[i] = bin.charCodeAt(i);
      var blob = new Blob([bytes], { type: "application/octet-stream" });
      return URL.createObjectURL(blob);
    }

    var CANVAS = document.getElementById("cg");
    var r = null, vmi = null;
    var u = new URL(window.location.href);
    var params = u.searchParams;

    ${obsDefaultsObj}

    var ab = params.get("artboard") || params.get("ab") || ${artboard ? JSON.stringify(artboard) : "undefined"};
    var sm = params.get("sm") || params.get("statemachine") || ${stateMachine ? JSON.stringify(stateMachine) : "undefined"};

    ${mode === "obs" ? obsParams : ""}

    ${embed ? `
    (function(){ var el = document.getElementById('riv-b64'); if (el) el.textContent = ${JSON.stringify(rivBase64)}; })();
    function getEmbeddedBase64(){ var el = document.getElementById('riv-b64'); return el ? el.textContent : ""; }
    var RIV_BASE64 = getEmbeddedBase64();
    var riv = ${rivSourceExpr};` : `
    var riv = ${rivSourceExpr};`}

    function applyFromUrl(){
      if (!vmi) return;
      var v, it, n, b, c;
      ${urlSetters}
      params.forEach(function(value, key){
        if (key.indexOf("vm.") !== 0) return;
        var name = key.slice(3);
        try {
          if (vmi.string && (it = vmi.string(name)))   { it.value = String(value); return; }
          if (vmi.number && (it = vmi.number(name)))   { var n = Number(value); if (isFinite(n)) it.value = n; return; }
          if (vmi.boolean && (it = vmi.boolean(name))) { var b = (String(value).toLowerCase()==="true"||value==="1"||String(value).toLowerCase()==="yes"); it.value = b; return; }
          if (vmi.color && (it = vmi.color(name)))     { var c = toColor32(value); if (c != null) it.value = c; return; }
          if (vmi.trigger && (it = vmi.trigger(name))) { if (value === "true" || value === "1") { fireVmTrigger(name); } return; }
        } catch(e){}
      });
    }

    ${applyDefaultsBlock}

    function boot(){
      try {
        r = new rive.Rive({
          src: riv,
          canvas: CANVAS,
          autoplay: false,
          artboard: ab,
          stateMachines: sm,
          autoBind: true,
          onLoad: function(){
            try { if (r && r.resizeDrawingSurfaceToCanvas) r.resizeDrawingSurfaceToCanvas(); } catch(e){}
            try { vmi = r && r.viewModelInstance ? r.viewModelInstance : null; } catch(e){ vmi = null; }
            try { applyBakedDefaults(); } catch(e){}
            try { applyFromUrl(); } catch(e){}
            ${mode === "obs" ? "scheduleInOut();" : ""}
            try { window.addEventListener("resize", function(){ try { if (r && r.resizeDrawingSurfaceToCanvas) r.resizeDrawingSurfaceToCanvas(); } catch(e){} }); } catch(e){}
          }
        });
      } catch(e){ console.error("Rive boot error", e); }
    }

    ${obsOnly}

    function apply(o){
      if (!o || !vmi) return;
      ${mode === "caspar" ? vprops.map(setterUpdateLine).join("\n      ") : ""}
    }

    boot();

    ${casparApi}
  })();
  </script>
</body>
</html>`;

  return html;
}

// generator helpers
function numOr(x, d){ return (typeof x === "number" && isFinite(x)) ? x : d; }
function esc(s){ return String(s).replace(/["\\]/g, (m) => "\\" + m); }

function setterLine(p){
  const key = `vm.${p.name}`;  // URL key (exact/case sensitive)
  const safe = esc(p.name);
  if (p.type === "string")
    return `v = params.get("${key}"); if (v != null) { try { if (vmi && vmi.string) { it = vmi.string("${safe}"); if (it) it.value = String(v); } } catch(e){} }`;
  if (p.type === "number")
    return `v = params.get("${key}"); if (v != null) { n = Number(v); if (isFinite(n)) { try { if (vmi && vmi.number) { it = vmi.number("${safe}"); if (it) it.value = n; } } catch(e){} } }`;
  if (p.type === "boolean")
    return `v = params.get("${key}"); if (v != null) { b = (String(v).toLowerCase()==="true"||v==="1"||String(v).toLowerCase()==="yes"); try { if (vmi && vmi.boolean) { it = vmi.boolean("${safe}"); if (it) it.value = b; } } catch(e){} }`;
  if (p.type === "color")
    return `v = params.get("${key}"); if (v != null) { c = toColor32(v); if (c != null) { try { if (vmi && vmi.color) { it = vmi.color("${safe}"); if (it) it.value = c; } } catch(e){} } }`;
  if (p.type === "trigger")
    return `v = params.get("${key}"); if (v==="true" || v==="1") { try { fireVmTrigger("${safe}"); } catch(e){} }`;
  return "";
}

function bakeDefaultLine(name, value){
  const safe = esc(name);
  const valS = String(value);
  return `(function(){
    var it;
    try {
      if (vmi.string && (it = vmi.string("${safe}")))   { it.value = ${JSON.stringify(valS)}; return; }
      if (vmi.number && (it = vmi.number("${safe}")))   { var n = Number(${JSON.stringify(valS)}); if (isFinite(n)) it.value = n; return; }
      if (vmi.boolean && (it = vmi.boolean("${safe}"))) { var b = (String(${JSON.stringify(valS)}).toLowerCase() === "true"); it.value = b; return; }
      if (vmi.color && (it = vmi.color("${safe}")))     { var c = toColor32(${JSON.stringify(valS)}); if (c!=null) it.value = c; return; }
    } catch(e){}
  })();`;
}

function setterUpdateLine(p){
  const key = p.name; // Caspar UPDATE uses VM names as keys (case-sensitive)
  const safe = esc(p.name);
  if (p.type === "string")
    return `if (o["${key}"] != null) try { if (vmi && vmi.string) { var it=vmi.string("${safe}"); if (it) it.value = String(o["${key}"]); } } catch(e){}`;
  if (p.type === "number")
    return `if (o["${key}"] != null) try { if (vmi && vmi.number) { var it=vmi.number("${safe}"); if (it) it.value = Number(o["${key}"]||0); } } catch(e){}`;
  if (p.type === "boolean")
    return `if (o["${key}"] != null) try { if (vmi && vmi.boolean) { var it=vmi.boolean("${safe}"); if (it) it.value = !!o["${key}"]; } } catch(e){}`;
  if (p.type === "color")
    return `if (o["${key}"] != null) { try { var s=String(o["${key}"]).trim(); var c=(s.charAt(0)==="#") ? (s.length===7 ? (0xFF000000|parseInt(s.slice(1),16))>>>0 : (parseInt(s.slice(1),16))>>>0) : Number(s); if (vmi && vmi.color) { var it=vmi.color("${safe}"); if (it) it.value = c; } } catch(e){} }`;
  if (p.type === "trigger")
    return `if (o["${key}"] === true) { try { fireVmTrigger("${safe}"); } catch(e){} }`;
  return "";
}
