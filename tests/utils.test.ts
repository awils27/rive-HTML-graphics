import { describe, expect, it } from "vitest";
import { filenameBase, sanitizeFilename } from "../src/utils";

describe("filename helpers", () => {
  it("sanitizes unsafe filename characters", () => {
    expect(sanitizeFilename('Lower: Third / "Main"')).toBe("Lower- Third - -Main-");
  });

  it("removes the extension and falls back to graphic", () => {
    expect(filenameBase("scoreboard.riv")).toBe("scoreboard");
    expect(filenameBase(".riv")).toBe("graphic");
  });
});
