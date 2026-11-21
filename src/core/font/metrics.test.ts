import type { Font } from "opentype.js";
import { describe, expect, it } from "vitest";
import { computeGlyphMetrics, readVerticals, usedMetrics } from "./metrics.ts";

function fakeFont(parts: {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  os2?: Record<string, number>;
}): Font {
  return {
    unitsPerEm: parts.unitsPerEm,
    ascender: parts.ascender,
    descender: parts.descender,
    tables: parts.os2 ? { os2: parts.os2 } : {},
  } as unknown as Font;
}

describe("computeGlyphMetrics", () => {
  it("prefers OS/2 typo metrics (Noto-like: the typo box is exactly 1 em)", () => {
    const font = fakeFont({
      unitsPerEm: 1000,
      ascender: 1160,
      descender: -288,
      os2: { sTypoAscender: 880, sTypoDescender: -120 },
    });

    const m = computeGlyphMetrics(font, 56);

    expect(m.scale).toBeCloseTo(0.056);
    expect(m.ascent).toBeCloseTo(49.28);
  });

  it("falls back to hhea without an OS/2 table", () => {
    const font = fakeFont({ unitsPerEm: 1024, ascender: 995, descender: 169 });

    const m = computeGlyphMetrics(font, 56);

    expect(m.ascent).toBeCloseTo((995 * 56) / 1024);
  });

  it("falls back to hhea when the typo box is unusable: all zero, no positive ascender, or no height", () => {
    for (const os2 of [
      { sTypoAscender: 0, sTypoDescender: 0 },
      { sTypoAscender: 0, sTypoDescender: -120 },
      { sTypoAscender: -50, sTypoDescender: -120 },
      { sTypoAscender: 500, sTypoDescender: 500 },
    ]) {
      const font = fakeFont({
        unitsPerEm: 1000,
        ascender: 900,
        descender: -200,
        os2,
      });
      expect(computeGlyphMetrics(font, 100).ascent).toBeCloseTo(90);
    }
  });
});

describe("readVerticals", () => {
  it("reads the three sets of a Noto-like font, and draws from the typo one", () => {
    const font = fakeFont({
      unitsPerEm: 1000,
      ascender: 1160,
      descender: -288,
      os2: {
        sTypoAscender: 880,
        sTypoDescender: -120,
        usWinAscent: 1160,
        usWinDescent: 288,
        sxHeight: 536,
        sCapHeight: 733,
      },
    });
    const v = readVerticals(font);
    expect(v.typo).toEqual({ ascender: 880, descender: -120 });
    expect(v.hhea).toEqual({ ascender: 1160, descender: -288 });
    expect(v.win).toEqual({ ascender: 1160, descender: -288 });
    expect(v.used).toBe("typo");
    expect(usedMetrics(v)).toEqual({ ascender: 880, descender: -120 });
    expect(v.xHeight).toBe(536);
    expect(v.capHeight).toBe(733);
  });

  it("has no typo, win, x-height or cap height without an OS/2 table, and uses hhea", () => {
    const v = readVerticals(
      fakeFont({ unitsPerEm: 1000, ascender: 900, descender: -200 }),
    );
    expect(v.typo).toBeNull();
    expect(v.win).toBeNull();
    expect(v.used).toBe("hhea");
    expect(v.xHeight).toBeNull();
    expect(v.capHeight).toBeNull();
    expect(usedMetrics(v)).toEqual({ ascender: 900, descender: -200 });
  });

  it("treats an x-height of 0 as absent", () => {
    const v = readVerticals(
      fakeFont({
        unitsPerEm: 1000,
        ascender: 900,
        descender: -200,
        os2: { sTypoAscender: 800, sTypoDescender: -200, sxHeight: 0 },
      }),
    );
    expect(v.xHeight).toBeNull();
  });
});
