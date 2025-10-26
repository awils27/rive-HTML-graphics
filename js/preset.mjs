// public/js/preset.mjs
import { downloadBlob } from './utils.mjs';

function escapeXml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function formatValueForXml(prop) {
  const { type, value } = prop;
  if (value == null) return '';
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number')  return String(value);
  if (type === 'color') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      const rgb = (n & 0xFFFFFF) >>> 0;
      return '#' + rgb.toString(16).padStart(6, '0').toUpperCase();
    }
    return String(value);
  }
  return String(value);
}

export function buildCasparPresetXml(schema, htmlFilename) {
  const nameNoExt = String(htmlFilename || 'template.html').replace(/\.html$/i, '');
  const vprops = Array.isArray(schema?.viewModelProps) ? schema.viewModelProps : [];

  const rows = vprops
    .filter(p => p.type !== 'trigger')
    .map(p => `    <componentData id="${escapeXml(p.name)}"><data value="${escapeXml(formatValueForXml(p))}"/></componentData>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<template name="${escapeXml(nameNoExt)}">
  <templateData>
${rows}
  </templateData>
</template>
`;
}

export function downloadCasparPresetXml(schema, htmlFilename) {
  const xml = buildCasparPresetXml(schema, htmlFilename);
  const outName = String(htmlFilename || 'template.html').replace(/\.html$/i, '') + '.xml';
  downloadBlob(new Blob([xml], { type: 'application/xml' }), outName);
}
