export const $ = <T extends Element = Element>(
  selector: string,
  root: ParentNode = document,
): T | null => root.querySelector<T>(selector);

export function sanitizeFilename(value: string): string {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function filenameBase(name: string): string {
  return sanitizeFilename(String(name || "graphic").replace(/\.[^.]+$/, "")) || "graphic";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.readAsDataURL(file);
  });
}
