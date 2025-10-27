// public/js/app.mjs
import { inspectContents, buildSchema } from './rive-introspect.mjs';
import { buildTemplate } from './template-builders.mjs';
import { downloadBlob } from './utils.mjs';
import { downloadCasparClientPresetXml } from './preset.mjs';

function $(id) { return document.getElementById(id); }
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
function setText(el, s) { if (el) el.textContent = s; }

let elFile, elArtSel, elSmSel, elRuntimeSel, elEmbedCk, elBtnHtml, elBtnPreset, elStatus, elVmTable;

let file = null;
let blobURL = null;
let contents = null;
let schema = null;
let baseName = 'graphic';

function filenameBase(name) { return String(name || 'graphic').replace(/\.[^.]+$/,''); }
function revokeBlob(){ try { if (blobURL) URL.revokeObjectURL(blobURL); } catch {} blobURL = null; }

async function fileToBase64(f){
  const buf = await f.arrayBuffer();
  let s = ''; const b = new Uint8Array(buf);
  for (let i=0;i<b.length;i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function runtimeValue(){ const v = elRuntimeSel ? String(elRuntimeSel.value||'').toLowerCase() : 'canvas'; return v==='webgl' ? 'webgl' : 'canvas'; }
function embedChecked(){ return !!(elEmbedCk && elEmbedCk.checked); }

function populateSelect(select, items){
  if (!select) return;
  const prev = select.value; select.innerHTML = '';
  items.forEach(n => { const o = document.createElement('option'); o.value=n; o.textContent=n; select.appendChild(o); });
  if (prev && items.includes(prev)) select.value = prev;
}
function updateVmTable(list){
  if (!elVmTable) return;
  const tbody = elVmTable.tBodies && elVmTable.tBodies[0] ? elVmTable.tBodies[0] : elVmTable;
  tbody.innerHTML = '';
  (list||[]).forEach(p => {
    const tr = document.createElement('tr');
    const tdN = document.createElement('td'); tdN.textContent = p.name;
    const tdT = document.createElement('td'); tdT.textContent = p.type;
    const tdD = document.createElement('td'); tdD.textContent = (p.value==null)?'':String(p.value);
    tr.append(tdN, tdT, tdD); tbody.appendChild(tr);
  });
}

async function analyzeSelectedFile(){
  if (!file) return;
  setText(elStatus, 'Loading Rive…');
  revokeBlob();
  blobURL = URL.createObjectURL(file);
  baseName = filenameBase(file.name);

  try {
    contents = await inspectContents(blobURL);
  } catch (e) {
    console.error(e); setText(elStatus, 'Failed to open Rive (see console).'); return;
  }

  const artboards = (contents && contents.artboards ? contents.artboards : contents?.data?.artboards) || [];
  const artNames = artboards.map(a => a.name || a);
  populateSelect(elArtSel, artNames);

  const sms = (contents && contents.stateMachines ? contents.stateMachines : contents?.data?.stateMachines) || [];
  const smNames = sms.map(s => s.name || s);
  populateSelect(elSmSel, smNames);

  const artSel = elArtSel ? elArtSel.value : (artNames[0] || undefined);
  const smSel  = elSmSel ? elSmSel.value  : (smNames[0] || undefined);

  try {
    schema = await buildSchema(blobURL, undefined, artSel, smSel);
  } catch (e) {
    console.error(e); setText(elStatus, 'Failed to build schema (see console).'); return;
  }

  updateVmTable(schema.viewModelProps || []);
  setText(elStatus, 'Rive ready.');
}

function wireEvents(){
  on(elFile, 'change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    file = f;
    await analyzeSelectedFile();
  });

  on(elArtSel, 'change', async () => {
    if (!file || !blobURL) return;
    const artSel = elArtSel.value || undefined;
    const smSel  = elSmSel ? elSmSel.value : undefined;
    try { schema = await buildSchema(blobURL, undefined, artSel, smSel); updateVmTable(schema.viewModelProps||[]); }
    catch (e){ console.error(e); setText(elStatus, 'Failed to rebuild schema (see console).'); }
  });

  on(elSmSel, 'change', async () => {
    if (!file || !blobURL) return;
    const artSel = elArtSel ? elArtSel.value : undefined;
    const smSel  = elSmSel.value || undefined;
    try { schema = await buildSchema(blobURL, undefined, artSel, smSel); updateVmTable(schema.viewModelProps||[]); }
    catch (e){ console.error(e); setText(elStatus, 'Failed to rebuild schema (see console).'); }
  });

  on(elBtnHtml, 'click', async () => {
    if (!schema){ setText(elStatus, 'Load a .riv first.'); return; }
    const useWebGL = (runtimeValue()==='webgl');
    const embed = embedChecked();
    let base64 = '', rivPath = '';
    if (embed){
      if (!file){ setText(elStatus, 'Select a .riv to embed.'); return; }
      base64 = await fileToBase64(file);
    } else {
      rivPath = file ? file.name : 'graphic.riv';
    }
    const html = buildTemplate(schema, {
      runtime: useWebGL ? 'webgl' : 'canvas',
      embed, base64, rivPath,
      casparTriggers: {
        in:  $('inTrigger')  ? $('inTrigger').value  : null,
        out: $('outTrigger') ? $('outTrigger').value : null,
        next:$('nextTrigger')? $('nextTrigger').value: null,
      }
    });
    const outName = `caspar-${baseName}.html`;
    downloadBlob(new Blob([html], { type:'text/html' }), outName);
    setText(elStatus, `Downloaded ${outName}`);
  });

  on(elBtnPreset, 'click', () => {
    if (!schema){ setText(elStatus, 'Load a .riv first.'); return; }
    const htmlName = `caspar-${baseName}.html`;
    downloadCasparClientPresetXml(schema, htmlName, { layer: 20, sendAsJson: false });
    setText(elStatus, `Downloaded ${htmlName.replace(/\.html$/i, '.xml')}`);
  });
}

function init(){
  // Find elements (all optional except some file input)
  elFile       = $('file') || document.querySelector('input[type="file"]');
  elArtSel     = $('artSel');
  elSmSel      = $('smSel');
  elRuntimeSel = $('runtimeSel');
  elEmbedCk    = $('embedCheckbox');
  elBtnHtml    = $('btnHtml');
  elBtnPreset  = $('btnPreset');
  elStatus     = $('status');
  elVmTable    = $('vmTable');

  if (!elFile){
    console.warn('No file input found. Add <input id="file" type="file" accept=".riv"> to the page.');
    setText(elStatus, 'No file input found.');
    return;
  }

  wireEvents();
}

// Wait for DOM to exist before querying elements
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('beforeunload', revokeBlob);
