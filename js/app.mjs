// public/js/app.mjs
import { $, sanitizeFilename, downloadBlob, fileToBase64 } from './utils.mjs';
import { buildTemplate } from './template-builders.mjs';
import { inspectContents, buildSchema } from './rive-introspect.mjs';
import { downloadCasparClientPresetXml } from './preset.mjs';

const els = {
  file:       $('#rivfile'),
  fileStatus: $('#fileStatus'),
  detected:   $('#detected'),
  artSel:     $('#artSel'),
  smSel:      $('#smSel'),
  vmTable:    $('#vmTable'),
  vmBody:     $('#vmBody'),
  vmEmpty:    $('#vmEmpty'),

  tabCaspar:  $('#tabCaspar'),
  tabObs:     $('#tabObs'),
  panelCaspar:$('#caspar'),
  panelObs:   $('#obs'),

  rtRadios:   [...document.querySelectorAll('input[name="rt"]')],
  embedCaspar:$('#embedCaspar'),
  inTrig:     $('#inTrig'),
  outTrig:    $('#outTrig'),
  nextTrig:   $('#nextTrig'),
  dlCaspar:   $('#dlCaspar'),
  dlCasparXml:$('#dlCasparXml'),
  status:     $('#status'),

  embedObs:   $('#embedObs'),
  startMs:    $('#startMs'),
  outAfterMs: $('#outAfterMs'),
  bakeDefaults: $('#bakeDefaults'),
  dlObs:      $('#dlObs'),
  paramsOut:  $('#paramsOut'),
  copyParams: $('#copyParams'),
};

// state
let file = null, blobURL = null, contents = null, schema = null;
let currentArt = '', currentSM = '';
let baseName = 'graphic';

function populateSelect(select, items, includeNone=false){
  const prev = select.value;
  select.innerHTML = '';
  if (includeNone) {
    const opt = document.createElement('option');
    opt.textContent = '(none)'; opt.value = '';
    select.appendChild(opt);
  }
  items.forEach(v => {
    const opt = document.createElement('option');
    opt.textContent = v; opt.value = v;
    select.appendChild(opt);
  });
  if (items.includes(prev)) select.value = prev;
}

function renderProps(vprops){
  const body = els.vmBody;
  body.innerHTML = '';
  if (!vprops?.length) {
    els.vmTable.style.display='none'; els.vmEmpty.style.display='block';
    return;
  }
  els.vmTable.style.display=''; els.vmEmpty.style.display='none';
  vprops.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><code>${p.name}</code></td><td>${p.type}</td><td>${p.value ?? ''}</td>`;
    body.appendChild(tr);
  });
}

function buildParamsPreview(){
  if (!schema) { els.paramsOut.value = ''; return; }
  const sp = new URLSearchParams();
  if (currentArt) sp.set('artboard', currentArt);
  if (currentSM)  sp.set('sm', currentSM);
  const start = Math.max(0, parseInt(els.startMs.value || '0', 10) || 0);
  const outA  = Math.max(0, parseInt(els.outAfterMs.value || '0', 10) || 0);
  sp.set('startMs', String(start));
  if (outA > 0) sp.set('outAfterMs', String(outA));
  if (els.bakeDefaults.checked){
    (schema.viewModelProps || []).forEach(p => {
      if (p.type === 'trigger') return;
      if (p.value == null) return;
      sp.set('vm.'+p.name, String(p.value));
    });
  }
  const qs = sp.toString();
  els.paramsOut.value = qs ? '?' + qs : '';
}

// tabs
function selectTab(which){
  const selCaspar = which === 'caspar';
  els.tabCaspar.setAttribute('aria-selected', selCaspar ? 'true':'false');
  els.tabObs.setAttribute('aria-selected', selCaspar ? 'false':'true');
  els.panelCaspar.hidden = !selCaspar;
  els.panelObs.hidden = selCaspar;
}
els.tabCaspar.addEventListener('click', e => { e.preventDefault(); selectTab('caspar'); });
els.tabObs.addEventListener('click', e => { e.preventDefault(); selectTab('obs'); });

// file selection
els.file.addEventListener('change', async () => {
  const f = els.file.files?.[0];
  if (!f){ els.fileStatus.textContent = 'No file selected.'; return; }
  file = f;
  baseName = (file.name || 'graphic').replace(/\.riv$/i,'');
  els.fileStatus.textContent = 'Reading…';
  schema = null;

  if (blobURL) URL.revokeObjectURL(blobURL);
  blobURL = URL.createObjectURL(file);

  try { contents = await inspectContents(blobURL); }
  catch(e){ console.error(e); alert('Failed to read the Rive file.'); return; }

  // artboards
  const artNames = (contents?.artboards || []).map(a => a.name);
  currentArt = artNames[0] || '';
  populateSelect(els.artSel, artNames);
  els.artSel.value = currentArt;

  // SMs for current art
  const art = (contents?.artboards || []).find(a => a.name === currentArt);
  const smNames = (art?.stateMachines || []).map(sm => sm.name);
  currentSM = smNames[0] || '';
  populateSelect(els.smSel, smNames);
  els.smSel.value = currentSM;

  // build schema
  try { schema = await buildSchema(blobURL, undefined, currentArt, currentSM); }
  catch(e){ console.error(e); alert('Failed to initialize Rive for this artboard/SM.'); return; }

  renderProps(schema.viewModelProps);

  // triggers
  const tNames = (schema.viewModelProps || []).filter(p => p.type === 'trigger').map(p => p.name);
  populateSelect(els.inTrig,  ['(none)', ...tNames]); els.inTrig.value = '';
  populateSelect(els.outTrig, ['(none)', ...tNames]); els.outTrig.value = '';
  populateSelect(els.nextTrig,['(none)', ...tNames]); els.nextTrig.value = '';

  els.detected.style.display = 'block';
  els.dlCaspar.disabled = false;
  els.dlCasparXml.disabled = false;
  els.dlObs.disabled = false;

  buildParamsPreview();
});

els.artSel.addEventListener('change', async () => {
  currentArt = els.artSel.value;
  const art = (contents?.artboards || []).find(a => a.name === currentArt);
  const smNames = (art?.stateMachines || []).map(sm => sm.name);
  currentSM = smNames[0] || '';
  populateSelect(els.smSel, smNames);
  els.smSel.value = currentSM;

  try { schema = await buildSchema(blobURL, undefined, currentArt, currentSM); }
  catch(e){ console.error(e); alert('Failed to initialize Rive for this artboard/SM.'); return; }
  renderProps(schema.viewModelProps);

  const tNames = (schema.viewModelProps || []).filter(p => p.type === 'trigger').map(p => p.name);
  populateSelect(els.inTrig,  ['(none)', ...tNames]); els.inTrig.value = '';
  populateSelect(els.outTrig, ['(none)', ...tNames]); els.outTrig.value = '';
  populateSelect(els.nextTrig,['(none)', ...tNames]); els.nextTrig.value = '';

  buildParamsPreview();
});

els.smSel.addEventListener('change', async () => {
  currentSM = els.smSel.value;
  try { schema = await buildSchema(blobURL, undefined, currentArt, currentSM); }
  catch(e){ console.error(e); alert('Failed to initialize Rive for this state machine.'); return; }
  renderProps(schema.viewModelProps);
  const tNames = (schema.viewModelProps || []).filter(p => p.type === 'trigger').map(p => p.name);
  populateSelect(els.inTrig,  ['(none)', ...tNames]); els.inTrig.value = '';
  populateSelect(els.outTrig, ['(none)', ...tNames]); els.outTrig.value = '';
  populateSelect(els.nextTrig,['(none)', ...tNames]); els.nextTrig.value = '';
  buildParamsPreview();
});

['input','change'].forEach(evt => {
  els.startMs.addEventListener(evt, buildParamsPreview);
  els.outAfterMs.addEventListener(evt, buildParamsPreview);
  els.bakeDefaults.addEventListener(evt, buildParamsPreview);
});

// downloads
els.dlCaspar.addEventListener('click', async () => {
  if (!schema) return;
  els.status.textContent = 'Generating…';

  let base64 = "";
  if (els.embedCaspar.checked) {
    try { base64 = await fileToBase64(file); } catch(e){ alert('Base64 encode failed'); return; }
  }

  const rt = (els.rtRadios.find(r => r.checked)?.value) || 'canvas';
  const html = buildTemplate(schema, {
    mode: 'caspar',
    runtime: rt,
    embed: !!els.embedCaspar.checked,
    base64,
    rivPath: file?.name || 'graphics.riv',
    artboard: currentArt,
    stateMachine: currentSM,
    casparTriggers: {
      in:  els.inTrig.value || null,
      out: els.outTrig.value || null,
      next: els.nextTrig.value || null
    }
  });

  const name = sanitizeFilename(`caspar-${baseName}.html`);
  downloadBlob(new Blob([html], { type: 'text/html' }), name);
  els.status.textContent = 'Downloaded.';
});

els.dlCasparXml.addEventListener('click', () => {
   if (!schema) return;
   const htmlName = `caspar-${baseName}.html`;
   // layer & sendAsJson can be surfaced in the UI later; defaults match your old builder
   downloadCasparClientPresetXml(schema, htmlName, { layer: 20, sendAsJson: true });
   els.status.textContent = 'Downloaded preset.';
});

els.dlObs.addEventListener('click', async () => {
  if (!schema) return;
  const embed = !!els.embedObs.checked;
  let base64 = "";
  if (embed) {
    try { base64 = await fileToBase64(file); } catch(e){ alert('Base64 encode failed'); return; }
  }
  const vmDefaults = els.bakeDefaults.checked
    ? Object.fromEntries((schema.viewModelProps || [])
        .filter(p => p.type !== 'trigger' && p.value != null)
        .map(p => [p.name, String(p.value)]))
    : null;

  const html = buildTemplate(schema, {
    mode: 'obs',
    embed,
    base64,
    rivPath: file?.name || 'graphics.riv',
    artboard: currentArt,
    stateMachine: currentSM,
    timers: {
      startMs: Math.max(0, parseInt(els.startMs.value || '0', 10) || 0),
      outAfterMs: Math.max(-1, parseInt(els.outAfterMs.value || '-1', 10) || -1),
      clearAfterMs: -1
    },
    vmDefaults
  });

  const name = sanitizeFilename(`obs-${baseName}${embed ? '.embedded' : ''}.html`);
  downloadBlob(new Blob([html], { type: 'text/html' }), name);
});

// copy params
els.copyParams.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(els.paramsOut.value); els.copyParams.textContent='Copied!'; setTimeout(()=>els.copyParams.textContent='Copy', 900); } catch {}
});
