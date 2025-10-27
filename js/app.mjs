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

// ---------- Elements (match index.html) ----------
let elFile, elFileStatus, elDetected, elArtSel, elSmSel;
let elVmBody;
let elInTrig, elOutTrig, elNextTrig;
let elEmbed, elBtnHtml, elBtnXml, elStatus;

// ---------- State ----------
let file = null;
let blobURL = null;
let contents = null; // result of contents()
let schema = null;   // result of buildSchema()
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
function populateSelect(sel, items, { placeholder = "— select —" } = {}) {
  if (!sel) return;
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder;
  sel.appendChild(ph);
  (items || []).forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
  sel.value = ''; // never auto-select
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
  [elInTrig, elOutTrig, elNextTrig].forEach(sel => populateSelect(sel, names, { placeholder: '— optional —' }));
}
function getArtboardNames(c) {
  const arr = (c && Array.isArray(c.artboards)) ? c.artboards : (c?.data?.artboards || []);
  return arr.map(a => a?.name ?? a).filter(Boolean);
}
function getStateMachineNamesForArtboard(c, artName) {
  if (!c || !artName) return [];
  const abs = Array.isArray(c.artboards) ? c.artboards : (c?.data?.artboards || []);
  const ab = abs.find(a => (a?.name ?? a) === artName);
  if (!ab) return [];
  const sms = Array.isArray(ab.stateMachines) ? ab.stateMachines : [];
  return sms.map(s => s?.name ?? s).filter(Boolean);
}

// ---------- Core ----------
async function analyzeSelectedFile() {
  if (!file) return;

  setText(elFileStatus, file ? `${file.name} (${(file.size/1024/1024).toFixed(2)} MB)` : 'No file selected.');

  revokeBlob();
  blobURL = URL.createObjectURL(file);
  baseName = filenameBase(file.name);

  setText(elStatus, 'Loading Rive…');

  // 1) Introspect (no defaults, no schema yet)
  try {
    contents = await inspectContents(blobURL);
  } catch (e) {
    console.error(e);
    setText(elStatus, 'Failed to open Rive (see console).');
    return;
  }

  // 2) Fill artboards; clear state machines
  const artNames = getArtboardNames(contents);
  populateSelect(elArtSel, artNames, { placeholder: '— choose artboard —' });
  populateSelect(elSmSel, [], { placeholder: '— choose state machine —' });

  // 3) UI state
  schema = null;
  updateVmTable([]);
  populateTriggers([]);
  show(elDetected, true);
  enable(elBtnHtml, false);
  enable(elBtnXml, false);
  setText(elStatus, 'Choose an artboard, then a state machine.');
}

async function maybeBuildSchema() {
  if (!file || !blobURL) return;
  const ab = elArtSel?.value || '';
  const sm = elSmSel?.value  || '';
  if (!ab || !sm) {
    schema = null;
    updateVmTable([]);
    populateTriggers([]);
    enable(elBtnHtml, false);
    enable(elBtnXml, false);
    setText(elStatus, 'Choose an artboard, then a state machine.');
    return;
  }
  try {
    schema = await buildSchema(blobURL, undefined, ab, sm);
    updateVmTable(schema.viewModelProps || []);
    populateTriggers(schema.viewModelProps || []);
    enable(elBtnHtml, true);
    enable(elBtnXml, true);
    setText(elStatus, 'Rive ready.');
  } catch (e) {
    console.error(e);
    schema = null;
    updateVmTable([]);
    populateTriggers([]);
    enable(elBtnHtml, false);
    enable(elBtnXml, false);
    setText(elStatus, 'Failed to build schema (see console).');
  }
}

// ---------- Event wiring ----------
function wire() {
  // Elements
  const elVmTable = $('#vmTable');
  elFile       = $('#rivfile') || document.querySelector('input[type="file"]');
  elFileStatus = $('#fileStatus');
  elDetected   = $('#detected');
  elArtSel     = $('#artSel');
  elSmSel      = $('#smSel');
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

  // Initial UI
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

  on(elArtSel, 'change', () => {
    // Populate SMs for chosen artboard; do not auto-select
    const sms = getStateMachineNamesForArtboard(contents, elArtSel.value);
    populateSelect(elSmSel, sms, { placeholder: '— choose state machine —' });
    // With new artboard, we must rebuild only after SM is chosen
    maybeBuildSchema();
  });

  on(elSmSel, 'change', () => {
    maybeBuildSchema();
  });

  on(elBtnHtml, 'click', async () => {
    if (!schema) { setText(elStatus, 'Select artboard & state machine first.'); return; }

    const runtime = currentRuntime();
    const embed = !!(elEmbed && elEmbed.checked);

    let base64 = '';
    let rivPath = '';
    if (embed) {
      if (!file) { setText(elStatus, 'Select a .riv to embed.'); return; }
      base64 = await fileToBase64(file);
    } else {
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
    if (!schema) { setText(elStatus, 'Select artboard & state machine first.'); return; }
    const htmlName = `caspar-${baseName}.html`;
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
