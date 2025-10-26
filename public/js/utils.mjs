// public/js/utils.mjs
export const $ = (sel, root=document) => root.querySelector(sel);

export function sanitizeFilename(s) {
  return String(s || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error || new Error("File read failed"));
    fr.onload = () => {
      const s = String(fr.result || "");
      resolve(s.split(",")[1] || ""); // strip data: prefix
    };
    fr.readAsDataURL(file);
  });
}
