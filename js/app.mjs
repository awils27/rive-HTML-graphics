// public/js/app.mjs
// Caspar-only front-end. Safe if optional controls are missing.

import { inspectContents, buildSchema } from './rive-introspect.mjs';
import { buildTemplate } from './template-builders.mjs';
import { downloadBlob } from './utils.mjs';
import { downloadCasparClientPresetXml } from './preset.mjs';

// ---------- tiny DOM helpers ----------
function $(id) { return document.getElementById(id); }
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
function setText(el, s) { if (el) el.textContent = s; }

// ---------- UI elements (all optional except #file) ----------
const elFile       = $('file');          // <input type="file" accept=".riv">
const elArtSel     = $('artSel');        // <select> (optional)
const elSmSel      = $('smSel');         // <select> (optional)
const elRuntimeSel = $('runtimeSel');    // <select id="runtimeSel"> canvas|webgl (optional)
const elEmbedCk    = $('embedCheckbox'); // <input type="checkbox" (optional)
const elBtnHtml    = $('btnHtml');       // Download Caspar HTML (optional but useful)
const elBtnPreset  = $('btnPreset');     // Download Caspar XML preset (optional)
const elStatus     = $('status');        // <small id="status"> (optional)
const elVmTable    = $('vmTable');       // <table> to preview VM props (optional)

// ---------- working state ----------
let file    = null;
let blobURL = null;
let contents = null; // from inspectContents
let schema   = null; // from buildSchema
let baseName = 'graphic';

// safe URL.revokeObjectURL
function revokeBlob() {
  try { if (blobURL) URL.revokeObjectURL(blobURL); } catch {}
  blobURL = null;
}

function filenameBase(name) {
  return String(name || 'graphic').replace(/\.[^.]+$/,'');
}

async function fileToBase64(f) {
  const buf = await f.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function runtimeValue() {
  // default canvas if selector missing
  const v = elRuntimeSel ? String(elRuntimeSel.value || '').toLowerCase() : 'canvas';
  return (v === 'webgl') ? 'webgl' : 'canvas';
}

function embedChecked() {
  // default false if checkbox missing
  return !!(elEmbedCk && elEmbedCk.checked);
}

function populateSelect(select, items) {
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '';
  items.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  // restore if still present
  if (prev && items.includes(prev)) select.value = prev;
}

function updateVmTable(list) {
  if (!elVmTable) return;
  // expect a <tbody> inside #vmTable (fallback if not)
  const tbody = elVmTable.tBodies && elVmTable.tBodies[0] ? elVmTable.tBodies[0] : elVmTable;
  tbody.innerHTML = '';
  (list || []).forEach(p => {
    const tr = document.createElement('tr');
    const tdN = document.createElement('td');
    const tdT = document.createElement('td');
    const tdD = document.createElement('td');
    tdN.textContent = p.name;
    tdT.textContent = p.type;
    tdD.textContent = (p.value == null) ? '' : String(p.value);
    tr.appendChild(tdN); tr.appendChild(tdT); tr.appendChild(tdD);
    tbody.appendChild(tr);
  });
}

async function analyzeSelectedFile() {
  if (!file) return;
  setText(elStatus, 'Loading Rive…');

  revokeBlob();
  blobURL = URL.createObjectURL(file);
  baseName = filenameBase(file.name);

  try {
    // Discover artboards/state machines
    contents = await inspectContents(blobURL);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to open Rive (see console).');
    return;
  }

  // Pull names (best-effort; contents API may vary by version)
  const artboards = (contents && contents.artboards ? contents.artboards : contents?.data?.artboards) || [];
  const artNames = artboards.map(a => a.name || a);
  populateSelect(elArtSel, artNames);

  const sms = (contents && contents.stateMachines ? contents.stateMachines : contents?.data?.stateMachines) || [];
  const smNames = sms.map(s => s.name || s);
  populateSelect(elSmSel, smNames);

  // Pick current selection (if selects missing, pass undefined)
  const artSel = elArtSel ? elArtSel.value : (artNames[0] || undefined);
  const smSel  = elSmSel ? elSmSel.value  : (smNames[0] || undefined);

  // Build view model schema using chosen artboard/state machine
  try {
    schema = await buildSchema(blobURL, undefined, artSel, smSel);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to build schema (see console).');
    return;
  }

  updateVmTable(schema.viewModelProps || []);
  setText(elStatus, 'Rive ready.');
}

// ---------- event wiring (SAFE) ----------
on(elFile, 'change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  file = f;
  await analyzeSelectedFile();
});

on(elArtSel, 'change', async () => {
  if (!file || !blobURL) return;
  // Rebuild schema with new artboard
  const artSel = elArtSel.value || undefined;
  const smSel  = elSmSel ? elSmSel.value : undefined;
  try {
    schema = await buildSchema(blobURL, undefined, artSel, smSel);
    updateVmTable(schema.viewModelProps || []);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to rebuild schema (see console).');
  }
});

on(elSmSel, 'change', async () => {
  if (!file || !blobURL) return;
  // Rebuild schema with new state machine
  const artSel = elArtSel ? elArtSel.value : undefined;
  const smSel  = elSmSel.value || undefined;
  try {
    schema = await buildSchema(blobURL, undefined, artSel, smSel);
    updateVmTable(schema.viewModelProps || []);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to rebuild schema (see console).');
  }
});

on(elBtnHtml, 'click', async () => {
  if (!schema) { setText(elStatus, 'Load a .riv first.'); return; }

  const useWebGL = (runtimeValue() === 'webgl');
  const embed = embedChecked();

  let base64 = '';
  let rivPath = '';
  if (embed) {
    if (!file) { setText(elStatus, 'Select a .riv to embed.'); return; }
    base64 = await fileToBase64(file);
  } else {
    // When not embedding, we put the filename in the HTML for Caspar to read from disk.
    rivPath = file ? file.name : 'graphic.riv';
  }

  const html = buildTemplate(schema, {
    runtime: useWebGL ? 'webgl' : 'canvas',
    embed,
    base64,
    rivPath,
    casparTriggers: {
      in:  $('inTrigger')  ? $('inTrigger').value  : null,
      out: $('outTrigger') ? $('outTrigger').value : null,
      next:$('nextTrigger')? $('nextTrigger').value: null,
    }
    // vmDefaults: { } // optional baked defaults for testing
  });

  const outName = `caspar-${baseName}.html`;
  downloadBlob(new Blob([html], { type: 'text/html' }), outName);
  setText(elStatus, `Downloaded ${outName}`);
});

on(elBtnPreset, 'click', () => {
  if (!schema) { setText(elStatus, 'Load a .riv first.'); return; }
  const htmlName = `caspar-${baseName}.html`;
  // XML is safer than JSON for ADD/UPDATE
  downloadCasparClientPresetXml(schema, htmlName, { layer: 20, sendAsJson: false });
  setText(elStatus, `Downloaded ${htmlName.replace(/\.html$/i, '.xml')}`);
});

// Optional: runtime / embed UI can exist or not; no listeners needed.

window.addEventListener('beforeunload', revokeBlob);
