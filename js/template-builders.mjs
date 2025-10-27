// public/js/template-builders.mjs
// Generates a single-file HTML template for CasparCG (front-end only).
// - Robust UPDATE handling (XML or lenient JSON)
// - Early update() stub to capture ADD data before the page loads
// - Queues updates until Rive/ViewModel are ready; drains before first PLAY
// - Optional Base64 embedding of .riv (safe, no giant JS string)
// - ES5-safe inline JS for Caspar's CEF
// - Supports string/number/boolean/color/trigger/image ViewModel props
//
// Usage:
//   const html = buildTemplate(schema, {
//     runtime: "canvas" | "webgl",
//     embed: true | false,
//     base64: "<riv as base64>",   // required if embed=true
//     rivPath: "./graphics.riv",   // used if embed=false
//     casparTriggers: { in: "IN", out: "OUT", next: null },
//     // optional baked defaults (mostly useful for testing)
//     vmDefaults: { Title: "Hello", Headshot: "data:image/png;base64,..." },
//   });

export function buildTemplate(schema = {}, opts = {}) {
  const runtime = opts.runtime === "webgl" ? "webgl" : "canvas";

  const artboard = schema.artboard || "";
  const stateMachine = schema.stateMachine || "";
  const vprops = Array.isArray(schema.viewModelProps) ? schema.viewModelProps : [];

  const embed = !!opts.embed;
  const rivBase64 = embed ? (opts.base64 || "") : "";
  const rivPath   = !embed ? (opts.rivPath || "./graphics.riv") : "";

  const casparTriggers = opts.casparTriggers || {};   // { in?, out?, next? }
  const vmDefaults = opts.vmDefaults && typeof opts.vmDefaults === "object" ? opts.vmDefaults : null;

  const runtimeScript =
    runtime === "webgl"
      ? '<script src="https://unpkg.com/@rive-app/webgl"></script>'
      : '<script src="https://unpkg.com/@rive-app/canvas"></script>';

  // Optional URL param → VM setters (handy for quick tests)
  const urlSetters = vprops.map(setterLine).filter(Boolean).join("\n      ");

  const vmDefaultsLines = vmDefaults
    ? Object.keys(vmDefaults).map((name) => bakeDefaultLine(name, vmDefaults[name])).join("\n      ")
    : "";

  // Embed .riv safely (not inside a JS string)
  const b64Tag = embed
    ? `<script type="application/octet-stream" id="riv-b64">${rivBase64.replace(/<\/script/gi, '<\\/script')}</script>`
    : `<script type="application/octet-stream" id="riv-b64"></script>`;

  // Early stub to capture ADD data before the page JS/runtimes load
  const earlyStub = `
<script>
// Capture data calls that might arrive before the page JS is ready.
(function(){
  if (!window.__caspar) window.__caspar = { q: [] };
  var q = window.__caspar.q;
  // Stubs push raw payloads; real handler will drain later.
  window.update  = function(payload){ q.push(['update', payload]); };
  window.data    = window.update;
  window.SetData = window.update;
})();
</script>`;

  // Caspar API: robust parse + early-call capture + queue + first-play guard
  const casparApi = `
    // --- Robust UPDATE + early-call capture + first-play guard ---
    var __hasUpdatedOnce = false;
    var __firstPlayPending = false;
    var __firstPlayTimer = null;
    var __firstPlayWaitMs = 250; // adjust if needed
    var __pendingUpdates = [];   // holds parsed objects until vmi exists

    function textByTag(root, tag){
      try { var el = root.getElementsByTagName(tag)[0]; return el ? (el.textContent || '') : ''; } catch(e){ return ''; }
    }
    function parseTemplateDataXml(raw){
      try{
        var doc = new DOMParser().parseFromString(String(raw), 'application/xml');
        var out = {};
        var nodes = doc.getElementsByTagName('componentData');
        if (!nodes || !nodes.length) nodes = doc.getElementsByTagName('componentdata');
        for (var i=0;i<(nodes?nodes.length:0);i++){
          var n = nodes[i];
          var id = n.getAttribute('id') || textByTag(n, 'id');
          var dataEl = n.getElementsByTagName('data')[0] || null;
          var val = dataEl ? (dataEl.getAttribute('value') || dataEl.textContent || '') : textByTag(n, 'value');
          if (id) out[id] = (val == null ? '' : String(val));
        }
        return out;
      } catch(e){ return {}; }
    }
    function stripBomAndTrim(s){ return String(s||'').replace(/^\\uFEFF/, '').trim(); }
    function unwrapIfQuoted(s){
      if (s.length >= 2 && ((s[0] === '"' && s[s.length-1] === '"') || (s[0] === "'" && s[s.length-1] === "'"))) {
        return s.slice(1, -1);
      }
      return s;
    }
    function escapeBareNewlinesInJson(s){ return String(s).replace(/\\r?\\n/g, '\\\\n'); }
    function normalizeCasparJsonObject(o){
      if (!o || typeof o !== 'object') return {};
      var td = o.templateData || o.templatedata;
      if (td){
        var arr = td.componentData || td.componentdata || [];
        var map = {};
        for (var i=0;i<arr.length;i++){
          var it = arr[i] || {};
          var id = it.id || it.componentId || it.name;
          var val = (it.data && (it.data.value!=null ? it.data.value : it.data.text)) || it.value || '';
          if (id) map[id] = String(val);
        }
        return map;
      }
      return o; // assume already flat map
    }
    function parseCasparJsonStrict(s){
      var o = (typeof s === 'string') ? JSON.parse(s) : s;
      return normalizeCasparJsonObject(o);
    }
    function parseCasparJsonLenient(raw){
      try{
        if (typeof raw === 'string') return parseCasparJsonStrict(raw);
        return normalizeCasparJsonObject(raw);
      } catch(_) {
        try {
          var s = (typeof raw === 'string') ? raw : JSON.stringify(raw);
          s = stripBomAndTrim(s);
          s = unwrapIfQuoted(s);
          s = escapeBareNewlinesInJson(s);
          return parseCasparJsonStrict(s);
        } catch(__) {
          var s2 = (typeof raw === 'string') ? raw : '';
          var out = {};
          s2.replace(/[\\r\\n]+/g, ' ').replace(/"([^"\\\\]+)"\\s*:\\s*"([^"\\\\]*)"/g, function(_, k, v){ out[k] = v; });
          return out;
        }
      }
    }

    function __doPlayNow(){
      try { if (r && r.play) r.play(); } catch(e){}
      ${casparTriggers.in ? `fireVmTrigger(${JSON.stringify(casparTriggers.in)});` : ""}
    }

    // Real handlers (replace early stubs)
    function __realUpdate(raw){
      try{
        if (raw == null) return;
        var obj = {};
        if (typeof raw === 'string'){
          var s = stripBomAndTrim(raw);
          var first = s.replace(/^[\\s\\r\\n]+/,'').charAt(0);
          obj = (first === '<') ? parseTemplateDataXml(s) : parseCasparJsonLenient(s);
        } else if (typeof raw === 'object') {
          obj = parseCasparJsonLenient(raw);
        }
        if (!vmi){ __pendingUpdates.push(obj); return; }
        apply(obj);
        __hasUpdatedOnce = true;
        if (__firstPlayPending){
          __firstPlayPending = false;
          if (__firstPlayTimer){ clearTimeout(__firstPlayTimer); __firstPlayTimer = null; }
          __doPlayNow();
        }
      } catch(e){ console.error("UPDATE parse error", e); }
    }
    window.update  = __realUpdate;
    window.data    = __realUpdate;
    window.SetData = __realUpdate;

    window.play = function(){
      // If we haven't seen an update yet, give it a short window to arrive.
      if (!__hasUpdatedOnce){
        __firstPlayPending = true;
        if (!__firstPlayTimer){
          __firstPlayTimer = setTimeout(function(){
            if (__firstPlayPending){
              __firstPlayPending = false;
              __doPlayNow(); // proceed with defaults if nothing arrived
            }
          }, __firstPlayWaitMs);
        }
        return;
      }
      __doPlayNow();
    };
    window.next   = function(){ ${casparTriggers.next ? `fireVmTrigger(${JSON.stringify(casparTriggers.next)});` : ""} };
    window.stop   = function(){ var fired = ${casparTriggers.out ? `fireVmTrigger(${JSON.stringify(casparTriggers.out)})` : `false`}; if (!fired) { try { if (r && r.stop) r.stop(); } catch(e){} } };
    window.remove = function(){ try { if (r && r.cleanup) r.cleanup(); } catch(e){} };
  `;

  // Precompute VM maps (case-insensitive mapping support)
  const vmIndexLiteral = '{' + vprops.map(p => `"${p.name.toLowerCase()}":"${esc(p.name)}"`).join(',') + '}';
  const vmTypesLiteral = '{' + vprops.map(p => `"${esc(p.name)}":"${p.type}"`).join(',') + '}';

  const html = `<!doctype html>
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
  <script>
  (function(){
    "use strict";
    function num(v, d){ var n = Number(v); return isFinite(n) ? n : d; }
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
        if (typeof t.fire === "function"){ t.fire(); return true; }
        if (typeof t.trigger === "function"){ t.trigger(); return true; }
        if (typeof t === "object" && "value" in t){ try { t.value = true; return true; } catch(e){} }
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
    function getEmbeddedBase64(){ var el = document.getElementById('riv-b64'); return el ? (el.textContent || '') : ""; }

    // Image binding helper (data:, b64:, https:)
    function setImageFromSource(propName, src) {
      if (!vmi) return;
      try {
        var ip = vmi.image ? vmi.image(propName) : null;
        if (!ip) return;

        if (src == null || src === "" || src === "clear" || src === "none") {
          ip.value = null;
          return;
        }

        function decodeAndSet(bytes) {
          try {
            rive.decodeImage(bytes).then(function(img) {
              try { ip.value = img; } finally { try { img.unref && img.unref(); } catch(e){} }
            }).catch(function(e){ console.error("decodeImage failed", e); });
          } catch (e) { console.error("decodeImage threw", e); }
        }

        var s = String(src);

        if (/^data:/i.test(s)) {
          var i = s.indexOf("base64,");
          if (i >= 0) {
            var b64 = s.slice(i + 7);
            var bin = atob(b64);
            var arr = new Uint8Array(bin.length);
            for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
            decodeAndSet(arr); return;
          }
          console.warn("data: URL without base64 not supported"); return;
        }

        if (/^b64:/i.test(s)) {
          var b64raw = s.slice(4);
          var bin2 = atob(b64raw);
          var arr2 = new Uint8Array(bin2.length);
          for (var m = 0; m < bin2.length; m++) arr2[m] = bin2.charCodeAt(m);
          decodeAndSet(arr2); return;
        }

        if (/^https?:/i.test(s)) {
          fetch(s, { cache: "no-store" })
            .then(function(r){ return r.arrayBuffer(); })
            .then(function(buf){ decodeAndSet(new Uint8Array(buf)); })
            .catch(function(e){ console.error("fetch image failed", e); });
          return;
        }

        // Fallback: try raw base64
        try {
          var bin3 = atob(s);
          var arr3 = new Uint8Array(bin3.length);
          for (var n = 0; n < bin3.length; n++) arr3[n] = bin3.charCodeAt(n);
          decodeAndSet(arr3);
        } catch(e) {
          console.warn("Unrecognized image value:", s);
        }
      } catch(e) { console.error("setImageFromSource failed", e); }
    }

    var CANVAS = document.getElementById("cg");
    var r = null, vmi = null;

    // URL params (handy for testing from a browser)
    var u = new URL(window.location.href);
    var params = u.searchParams;

    // VM maps
    var VM_INDEX = ${vmIndexLiteral};   // lowercased -> exact VM name
    var VM_TYPES = ${vmTypesLiteral};   // exact VM name -> type

    // Defaults
    var DEF = {
      riv: ${embed ? '""' : JSON.stringify(rivPath)},
      artboard: ${JSON.stringify(artboard || "Artboard")},
      sm: ${JSON.stringify(stateMachine || "State Machine 1")}
    };

    var RIV_BASE64 = ${embed ? 'getEmbeddedBase64()' : '""'};
    var riv = ${embed ? '(RIV_BASE64 ? base64ToBlobUrl(RIV_BASE64) : DEF.riv)' : '(params.get("riv") || DEF.riv)' };
    var ab  = params.get("artboard") || params.get("ab") || (DEF.artboard || undefined);
    var sm  = params.get("sm") || params.get("statemachine") || (DEF.sm || undefined);

    function applyFromUrl(){
      if (!vmi) return;
      var v, it, n, b, c;
      ${urlSetters || ""}
      // Generic fallback: any param "vm.Name" not in schema attempts best-effort types
      params.forEach(function(value, key){
        if (key.indexOf("vm.")!==0) return;
        var name = key.slice(3);
        try {
          var it2;
          if (vmi.string && (it2=vmi.string(name)))   { it2.value = String(value); return; }
          if (vmi.number && (it2=vmi.number(name)))   { var nn=Number(value); if (isFinite(nn)) it2.value = nn; return; }
          if (vmi.boolean && (it2=vmi.boolean(name))) { it2.value = (String(value).toLowerCase()==="true"||value==="1"||String(value).toLowerCase()==="yes"); return; }
          if (vmi.color && (it2=vmi.color(name)))     { var cc=toColor32(value); if (cc!=null) it2.value = cc; return; }
          if (vmi.image && (it2=vmi.image(name)))     { setImageFromSource(name, String(value)); return; }
          if (vmi.trigger && (it2=vmi.trigger(name))) { if (value==="true"||value==="1") { fireVmTrigger(name); } return; }
        } catch(e){}
      });
    }

    ${vmDefaultsLines ? `function applyBakedDefaults(){ try { if (!vmi) return; ${vmDefaultsLines} } catch(e){} }` : `function applyBakedDefaults(){}`}

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

            // Drain any early stubs captured before our JS loaded
            try {
              var earlyQ = (window.__caspar && window.__caspar.q) ? window.__caspar.q : [];
              for (var i=0;i<earlyQ.length;i++){
                if (earlyQ[i][0] === 'update') { __realUpdate(earlyQ[i][1]); }
              }
              if (window.__caspar) window.__caspar.q = [];
            } catch(e){}

            // Apply any parsed updates that arrived before vmi existed
            try {
              if (typeof __pendingUpdates !== 'undefined' && __pendingUpdates && __pendingUpdates.length){
                for (var j=0;j<__pendingUpdates.length;j++) apply(__pendingUpdates[j]);
                __pendingUpdates.length = 0;
                if (typeof __hasUpdatedOnce !== 'undefined') __hasUpdatedOnce = true;
              }
            } catch(e){}

            try { window.addEventListener("resize", function(){ try { if (r && r.resizeDrawingSurfaceToCanvas) r.resizeDrawingSurfaceToCanvas(); } catch(e){} }); } catch(e){}
          }
        });
      } catch(e){ console.error("Rive boot error", e); }
    }

    function apply(o){
      if (!o || !vmi) return;

      // Fast path for known props (exact-name setters)
      ${vprops.map(setterUpdateLine).join("\n      ")}

      // Generic, case-insensitive fallback
      try {
        var VM_INDEX = ${vmIndexLiteral};
        var VM_TYPES = ${vmTypesLiteral};

        for (var k in o) {
          if (!o.hasOwnProperty(k)) continue;
          var name = k;
          if (!VM_TYPES[name]) {
            var lc = String(k).toLowerCase();
            if (VM_INDEX[lc]) name = VM_INDEX[lc];
          }
          var val = o[k];
          var it;
          var t = VM_TYPES[name];
          var done = false;

          try {
            if (t === "string"  && vmi.string  && (it=vmi.string(name)))   { it.value = String(val); done = true; }
            else if (t === "number" && vmi.number && (it=vmi.number(name))) { var n=Number(val); if (isFinite(n)) { it.value = n; done = true; } }
            else if (t === "boolean"&& vmi.boolean&& (it=vmi.boolean(name))){ it.value = (String(val).toLowerCase()==="true"||val===true||val===1||String(val).toLowerCase()==="yes"); done = true; }
            else if (t === "color"  && vmi.color  && (it=vmi.color(name)))   { var c = toColor32(val); if (c!=null){ it.value = c; done = true; } }
            else if (t === "image"  && vmi.image) { setImageFromSource(name, String(val)); done = true; }
            else if (t === "trigger" && (val===true || String(val)==="true" || String(val)==="1")) { fireVmTrigger(name); done = true; }
          } catch(e){}

          if (done) continue;

          // Unknown type: try all non-throwing setters
          try { if (!done && vmi.string  && (it=vmi.string(name)))  { it.value = String(val); done = true; } } catch(e){}
          try { if (!done && vmi.number  && (it=vmi.number(name)))  { var n2=Number(val); if (isFinite(n2)) { it.value = n2; done = true; } } } catch(e){}
          try { if (!done && vmi.boolean && (it=vmi.boolean(name))) { it.value = (String(val).toLowerCase()==="true"||val===true||val===1||String(val).toLowerCase()==="yes"); done = true; } } catch(e){}
          try { if (!done && vmi.color   && (it=vmi.color(name)))   { var c2=toColor32(val); if (c2!=null) { it.value = c2; done = true; } } } catch(e){}
          try { if (!done && vmi.image) { var test=vmi.image(name); if (test) { setImageFromSource(name, String(val)); done = true; } } } catch(e){}
          if (!done && (val===true || String(val)==="true" || String(val)==="1")) { try { fireVmTrigger(name); } catch(e){} }
        }
      } catch(e){}
    }

    boot();

    ${casparApi}
  })();
  </script>
</body>
</html>`;

  return html;
}

// helpers for the generator (Node/Browser-safe)
function esc(s){ return String(s).replace(/["\\]/g, (m) => "\\" + m); }

// Optional URL param → VM setter lines (inserted in template for quick tests)
function setterLine(p){
  const key = `vm.${p.name}`;  // exact (case-sensitive) URL key
  const safe = esc(p.name);
  if (p.type === "string")
    return `v = params.get("${key}"); if (v != null) { try { if (vmi && vmi.string) { it = vmi.string("${safe}"); if (it) it.value = String(v); } } catch(e){} }`;
  if (p.type === "number")
    return `v = params.get("${key}"); if (v != null) { n = Number(v); if (isFinite(n)) { try { if (vmi && vmi.number) { it = vmi.number("${safe}"); if (it) it.value = n; } } catch(e){} } }`;
  if (p.type === "boolean")
    return `v = params.get("${key}"); if (v != null) { b = (String(v).toLowerCase()==="true"||v==="1"||String(v).toLowerCase()==="yes"); try { if (vmi && vmi.boolean) { it = vmi.boolean("${safe}"); if (it) it.value = b; } } catch(e){} }`;
  if (p.type === "color")
    return `v = params.get("${key}"); if (v != null) { c = toColor32(v); if (c != null) { try { if (vmi && vmi.color) { it = vmi.color("${safe}"); if (it) it.value = c; } } catch(e){} } }`;
  if (p.type === "image")
    return `v = params.get("${key}"); if (v != null) { try { setImageFromSource("${safe}", String(v)); } catch(e){} }`;
  if (p.type === "trigger")
    return `v = params.get("${key}"); if (v === "true" || v === "1") { try { fireVmTrigger("${safe}"); } catch(e){} }`;
  return "";
}

// Caspar UPDATE exact-name setters (fast path)
function setterUpdateLine(p){
  const safe = esc(p.name);
  if (p.type === "trigger")
    return `if (o["${safe}"] === true) { try { fireVmTrigger("${safe}"); } catch(e){} }`;
  if (p.type === "string")
    return `if (o["${safe}"] != null) try { if (vmi && vmi.string) { var it=vmi.string("${safe}"); if (it) it.value = String(o["${safe}"]); } } catch(e){}`;
  if (p.type === "number")
    return `if (o["${safe}"] != null) { var n=Number(o["${safe}"]); if (isFinite(n)) try { if (vmi && vmi.number) { var it=vmi.number("${safe}"); if (it) it.value = n; } } catch(e){} }`;
  if (p.type === "boolean")
    return `if (o["${safe}"] != null) try { if (vmi && vmi.boolean) { var it=vmi.boolean("${safe}"); if (it) it.value = (String(o["${safe}"]).toLowerCase()==="true"||o["${safe}"]===true||o["${safe}"]===1||String(o["${safe}"]).toLowerCase()==="yes"); } } catch(e){}`;
  if (p.type === "color")
    return `if (o["${safe}"] != null) { var c=toColor32(o["${safe}"]); if (c!=null) try { if (vmi && vmi.color) { var it=vmi.color("${safe}"); if (it) it.value = c; } } catch(e){} }`;
  if (p.type === "image")
    return `if (o["${safe}"] != null) try { setImageFromSource("${safe}", String(o["${safe}"])); } catch(e){}`;
  return "";
}

// Bake default VM values (stringly-typed; converted at runtime)
function bakeDefaultLine(name, value){
  const safe = esc(name);
  return `try {
    var it;
    if (vmi && vmi.string && (it=vmi.string("${safe}")))   { it.value = String(${JSON.stringify(String(value))}); return; }
    if (vmi && vmi.number && (it=vmi.number("${safe}")))   { var n = Number(${JSON.stringify(String(value))}); if (isFinite(n)) it.value = n; return; }
    if (vmi && vmi.boolean && (it=vmi.boolean("${safe}"))) { var b = (String(${JSON.stringify(String(value))}).toLowerCase()==="true"); it.value = b; return; }
    if (vmi && vmi.color && (it=vmi.color("${safe}")))     { var c = toColor32(${JSON.stringify(String(value))}); if (c!=null) it.value = c; return; }
    if (vmi && vmi.image && (it=vmi.image("${safe}")))     { setImageFromSource("${safe}", String(${JSON.stringify(String(value))})); return; }
  } catch(e){}`;
}
