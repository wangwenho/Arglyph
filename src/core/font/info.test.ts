import type { Font } from "opentype.js";
import { describe, expect, it } from "vitest";
import { describeFont } from "./info.ts";

function fakeFont(overrides: Record<string, unknown> = {}): Font {
  const names: Record<string, string> = {
    fontFamily: "Noto Sans TC",
    fontSubfamily: "Regular",
    fullName: "Noto Sans TC Regular",
    version: "Version 2.004",
  };
  return {
    getEnglishName: (key: string) => names[key],
    outlinesFormat: "truetype",
    unitsPerEm: 1000,
    glyphs: { length: 20812 },
    tables: { cmap: { glyphIndexMap: { 65: 1, 66: 2, 67: 3 } } },
    ...overrides,
  } as unknown as Font;
}

describe("describeFont", () => {
  it("reads the English names", () => {
    const info = describeFont(fakeFont());

    expect(info.family).toBe("Noto Sans TC");
    expect(info.style).toBe("Regular");
    expect(info.fullName).toBe("Noto Sans TC Regular");
    expect(info.version).toBe("Version 2.004");
  });

  it("uses an empty string for names the font does not have", () => {
    const info = describeFont(fakeFont());

    expect(info.designer).toBe("");
    expect(info.license).toBe("");
  });

  it("names the outline format", () => {
    expect(describeFont(fakeFont()).format).toBe("TrueType");
    expect(describeFont(fakeFont({ outlinesFormat: "cff" })).format).toBe(
      "CFF",
    );
    expect(describeFont(fakeFont({ outlinesFormat: undefined })).format).toBe(
      "Unknown",
    );
  });

  it("counts glyphs and code points separately", () => {
    const info = describeFont(fakeFont());

    expect(info.glyphCount).toBe(20812);
    expect(info.codepointCount).toBe(3);
    expect(info.unitsPerEm).toBe(1000);
  });

  it("copes with a font that has no cmap table", () => {
    expect(describeFont(fakeFont({ tables: {} })).codepointCount).toBe(0);
  });
});
