export interface ZipSource {
  filename: string;
  data: Blob | ArrayBuffer | ArrayBufferView | string;
  modifiedAt?: Date;
}

interface PreparedZipEntry {
  filename: string;
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  modifiedAt: Date;
}

const textEncoder = new TextEncoder();

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sanitizeZipPath(filename: string): string {
  const cleaned = String(filename || "file")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  return cleaned || "file";
}

async function sourceToBytes(source: ZipSource["data"]): Promise<Uint8Array> {
  if (typeof source === "string") return textEncoder.encode(source);
  if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

function dosDateTime(date: Date): { dosDate: number; dosTime: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function makeLocalHeader(entry: PreparedZipEntry): Uint8Array {
  const { dosDate, dosTime } = dosDateTime(entry.modifiedAt);
  const header = new Uint8Array(30 + entry.nameBytes.length);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 0x0800);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, dosTime);
  writeUint16(view, 12, dosDate);
  writeUint32(view, 14, entry.crc);
  writeUint32(view, 18, entry.data.byteLength);
  writeUint32(view, 22, entry.data.byteLength);
  writeUint16(view, 26, entry.nameBytes.length);
  writeUint16(view, 28, 0);
  header.set(entry.nameBytes, 30);
  return header;
}

function makeCentralDirectoryHeader(entry: PreparedZipEntry, localOffset: number): Uint8Array {
  const { dosDate, dosTime } = dosDateTime(entry.modifiedAt);
  const header = new Uint8Array(46 + entry.nameBytes.length);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, 0x0800);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, dosTime);
  writeUint16(view, 14, dosDate);
  writeUint32(view, 16, entry.crc);
  writeUint32(view, 20, entry.data.byteLength);
  writeUint32(view, 24, entry.data.byteLength);
  writeUint16(view, 28, entry.nameBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, localOffset);
  header.set(entry.nameBytes, 46);
  return header;
}

function makeEndOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralSize);
  writeUint32(view, 16, centralOffset);
  writeUint16(view, 20, 0);
  return header;
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function createZip(sources: ZipSource[]): Promise<Blob> {
  const entries: PreparedZipEntry[] = [];
  for (const source of sources) {
    const filename = sanitizeZipPath(source.filename);
    const data = await sourceToBytes(source.data);
    entries.push({
      filename,
      nameBytes: textEncoder.encode(filename),
      data,
      crc: crc32(data),
      modifiedAt: source.modifiedAt || new Date(),
    });
  }

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const localHeader = makeLocalHeader(entry);
    localParts.push(localHeader, entry.data);
    centralParts.push(makeCentralDirectoryHeader(entry, offset));
    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endOfCentralDirectory = makeEndOfCentralDirectory(entries.length, centralSize, centralOffset);

  return new Blob([...localParts, ...centralParts, endOfCentralDirectory].map(toBlobPart), {
    type: "application/zip",
  });
}
