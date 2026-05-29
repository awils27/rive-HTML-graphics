import { describe, expect, it } from "vitest";
import { crc32, createZip } from "../src/zip";

function readString(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(start, start + length));
}

describe("zip builder", () => {
  it("calculates standard CRC-32 values", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });

  it("creates an uncompressed ZIP with local and central directory entries", async () => {
    const zip = await createZip([
      { filename: "manifest.ograf.json", data: "{}" },
      { filename: "assets\\graphic.riv", data: new Uint8Array([1, 2, 3]) },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(zip.type).toBe("application/zip");
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(readString(bytes, 30, "manifest.ograf.json".length)).toBe("manifest.ograf.json");

    const endOffset = bytes.byteLength - 22;
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(endOffset + 8, true)).toBe(2);
    expect(readString(bytes, bytes.byteLength - 22 - "assets/graphic.riv".length, "assets/graphic.riv".length)).toBe(
      "assets/graphic.riv",
    );
  });
});
