// public/js/preset.mjs
// Builds a CasparCG Client preset XML (not the AMCP <templateData> payload).
// Structure matches your previous version and keeps IDs case-sensitive.

import { downloadBlob } from './utils.mjs';

function xml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, ch => (
    {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&apos;','"':'&quot;'}[ch]
  ));
}

// Convert ViewModel default to a string for <value>…</value>
function valueForPreset(prop) {
  const { type, value } = prop || {};
  if (value == null) return '';
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number')  return String(value);
  if (type === 'color') {
    // Prefer #RRGGBB when numeric (Rive often stores ARGB uint32)
    const n = Number(value);
    if (Number.isFinite(n)) {
      const rgb = (n & 0xFFFFFF) >>> 0;
      return '#' + rgb.toString(16).padStart(6, '0').toUpperCase();
    }
    return String(value);
  }
  return String(value); // string/other
}

/**
 * Build CasparCG Client preset XML.
 * @param {object} schema - { viewModelProps: [{name,type,value}, ...] }
 * @param {string} htmlFilename - e.g. "caspar-MyLowerThird.html"
 * @param {object} opts - { layer=20, sendAsJson=true, label? }
 */
export function buildCasparClientPresetXml(schema, htmlFilename, opts = {}) {
  const layer = Number(opts.layer ?? 20) || 20;
  const sendAsJson = opts.sendAsJson !== false; // default true
  const nameNoExt = String(htmlFilename || 'template.html').replace(/\.html$/i, '');
  const label = opts.label ?? nameNoExt;

  const vprops = Array.isArray(schema?.viewModelProps) ? schema.viewModelProps : [];
  const rows = vprops
    .filter(p => p.type !== 'trigger') // triggers are actions, not preset values
    .map(p => `        <componentdata>
          <id>${xml(p.name)}</id>
          <value>${xml(valueForPreset(p))}</value>
        </componentdata>`)
    .join('\n');

  const templatedata = rows
    ? `\n      <templatedata>\n${rows}\n      </templatedata>`
    : `\n      <templatedata />`;

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
    <sendasjson>${sendAsJson ? 'true' : 'false'}</sendasjson>${templatedata}
    <color>Transparent</color>
  </item>
</items>
`;
}

export function downloadCasparClientPresetXml(schema, htmlFilename, opts = {}) {
  const xml = buildCasparClientPresetXml(schema, htmlFilename, opts);
  const outName = String(htmlFilename || 'template.html').replace(/\.html$/i, '') + '.xml';
  downloadBlob(new Blob([xml], { type: 'application/xml' }), outName);
}
