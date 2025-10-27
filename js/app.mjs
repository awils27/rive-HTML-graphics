// public/js/app.mjs
import { inspectContents, buildSchema } from './rive-introspect.mjs';
import { buildTemplate } from './template-builders.mjs';
import { downloadBlob } from './utils.mjs';
import { downloadCasparClientPresetXml } from './preset.mjs';

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
const setText = (el, s) => { if (el) el.textContent = s; };
const enable = (el, yes = true) => { if (el) el.disabled = !yes; };
const show = (el, yes = true) => { if (el) el.style.display = yes ? '' : 'none'; };

// ---------- Elements (match your index.html) ----------
let elFile, elFileStatus, elDetected, elArtSel, elSmSel;
let elVmTable, elVmBody;
let elInTrig, elOutTrig, elNextTrig;
let elEmbed, elBtnHtml, elBtnXml, elStatus;

// ---------- State ----------
let file = null;
let blobURL = null;
let contents = null;
let schema = null;
let baseName = 'graphic';

// ---------- Utils ----------
const revokeBlob = () => { try { if (blobURL) URL.revokeObjectURL(blobURL); } catch {} blobURL = null; };
const filenameBase = (name) => String(name || 'graphic').replace(/\.[^.]+$/,'');
async function fileToBase64(f) {
  const buf = await f.arrayBuffer();
  let s = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function currentRuntime() {
  const picked = document.querySelector('input[name="rt"]:checked');
  const v = picked ? picked.value : 'canvas';
  return (String(v).toLowerCase() === 'webgl') ? 'webgl' : 'canvas';
}
function populateSelect(sel, items) {
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  items.forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
  if (prev && items.includes(prev)) sel.value = prev;
}
function updateVmTable(list) {
  if (!elVmBody) return;
  elVmBody.innerHTML = '';
  (list || []).forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.name}</td><td>${p.type}</td><td>${p.value == null ? '' : String(p.value)}</td>`;
    elVmBody.appendChild(tr);
  });
}
function populateTriggers(list) {
  const names = (list || []).filter(p => p.type === 'trigger').map(p => p.name);
  [elInTrig, elOutTrig, elNextTrig].forEach(sel => populateSelect(sel, names));
}

// ---------- Core ----------
async function analyzeSelectedFile() {
  if (!file) return;

  // UI: file label
  setText(elFileStatus, file ? `${file.name} (${(file.size/1024/1024).toFixed(2)} MB)` : 'No file selected.');

  // Build a blob URL for the runtime
  revokeBlob();
  blobURL = URL.createObjectURL(file);
  baseName = filenameBase(file.name);

  setText(elStatus, 'Loading Rive…');

  // 1) Introspect for artboards / state machines
  try {
    contents = await inspectContents(blobURL);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to open Rive (see console).');
    return;
  }

  const artboards = (contents?.artboards ?? contents?.data?.artboards ?? []).map(a => a.name ?? a);
  const sms       = (contents?.stateMachines ?? contents?.data?.stateMachines ?? []).map(s => s.name ?? s);

  populateSelect(elArtSel, artboards);
  populateSelect(elSmSel, sms);

  // 2) Build ViewModel schema using current selections (or first available)
  const ab = elArtSel?.value || artboards[0] || undefined;
  const sm = elSmSel?.value  || sms[0]       || undefined;

  try {
    schema = await buildSchema(blobURL, undefined, ab, sm);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to build schema (see console).');
    return;
  }

  // 3) UI updates
  updateVmTable(schema.viewModelProps || []);
  populateTriggers(schema.viewModelProps || []);
  show(elDetected, true);
  enable(elBtnHtml, true);
  enable(elBtnXml, true);
  setText(elStatus, 'Rive ready.');
}

async function rebuildSchemaFromSelections() {
  if (!file || !blobURL) return;
  const ab = elArtSel?.value || undefined;
  const sm = elSmSel?.value  || undefined;
  try {
    schema = await buildSchema(blobURL, undefined, ab, sm);
    updateVmTable(schema.viewModelProps || []);
    populateTriggers(schema.viewModelProps || []);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to rebuild schema (see console).');
  }
}

// ---------- Event wiring ----------
function wire() {
  // Elements
  elFile       = $('#rivfile') || document.querySelector('input[type="file"]');
  elFileStatus = $('#fileStatus');
  elDetected   = $('#detected');
  elArtSel     = $('#artSel');
  elSmSel      = $('#smSel');
  elVmTable    = $('#vmTable');
  elVmBody     = $('#vmBody') || (elVmTable ? elVmTable.querySelector('tbody') : null);
  elInTrig     = $('#inTrig');
  elOutTrig    = $('#outTrig');
  elNextTrig   = $('#nextTrig');
  elEmbed      = $('#embedCaspar');
  elBtnHtml    = $('#dlCaspar');
  elBtnXml     = $('#dlCasparXml');
  elStatus     = $('#status');

  if (!elFile) {
    console.warn('No file input found (expected #rivfile).');
    setText(elStatus, 'No file input found.');
    return;
  }

  // Hide detected panel until parsed
  show(elDetected, false);
  enable(elBtnHtml, false);
  enable(elBtnXml, false);
  setText(elFileStatus, 'No file selected.');

  // Listeners
  on(elFile, 'change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    file = f;
    await analyzeSelectedFile();
  });

  on(elArtSel, 'change', rebuildSchemaFromSelections);
  on(elSmSel, 'change', rebuildSchemaFromSelections);

  on(elBtnHtml, 'click', async () => {
    if (!schema) { setText(elStatus, 'Load a .riv first.'); return; }

    const runtime = currentRuntime();
    const embed = !!(elEmbed && elEmbed.checked);

    let base64 = '';
    let rivPath = '';
    if (embed) {
      if (!file) { setText(elStatus, 'Select a .riv to embed.'); return; }
      base64 = await fileToBase64(file);
    } else {
      // When not embedding, we put the filename for Caspar to load from disk
      rivPath = file ? file.name : 'graphic.riv';
    }

    const casparTriggers = {
      in:   elInTrig?.value || null,
      out:  elOutTrig?.value || null,
      next: elNextTrig?.value || null,
    };

    const html = buildTemplate(schema, {
      runtime,
      embed,
      base64,
      rivPath,
      casparTriggers
    });

    const outName = `caspar-${baseName}.html`;
    downloadBlob(new Blob([html], { type: 'text/html' }), outName);
    setText(elStatus, `Downloaded ${outName}`);
  });

  on(elBtnXml, 'click', () => {
    if (!schema) { setText(elStatus, 'Load a .riv first.'); return; }
    const htmlName = `caspar-${baseName}.html`;
    // XML avoids JSON newline/quoting pitfalls in Caspar's HTML Producer
    downloadCasparClientPresetXml(schema, htmlName, { layer: 20, sendAsJson: false });
    setText(elStatus, `Downloaded ${htmlName.replace(/\.html$/i, '.xml')}`);
  });

  window.addEventListener('beforeunload', revokeBlob);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wire);
} else {
  wire();
}
