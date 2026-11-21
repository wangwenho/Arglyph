import { describe, expect, it } from "vitest";
import {
  computeGlyphBaselineY,
  computeGlyphOriginX,
  type GlyphBox,
} from "./origin.ts";

// 1000 units per em drawn in a 72px square.
const SCALE = 72 / 1000;
const SIZE = 72;

function box(overrides: Partial<GlyphBox>): GlyphBox {
  return {
    advance: 1000,
    inkMinX: 0,
    inkMaxX: 1000,
    inkMinY: -800,
    inkMaxY: 100,
    ...overrides,
  };
}

describe("computeGlyphOriginX", () => {
  it("puts the origin on the square's left edge for a full-width glyph", () => {
    expect(computeGlyphOriginX(100, SIZE, SCALE, box({}))).toBeCloseTo(100);
  });

  it("centers the advance box of a narrow glyph", () => {
    // advance 500 -> 36px, so 18px of space on each side
    expect(
      computeGlyphOriginX(0, SIZE, SCALE, box({ advance: 500 })),
    ).toBeCloseTo(18);
  });

  it("does not look at the ink when the advance is positive (keeps side bearings)", () => {
    const a = computeGlyphOriginX(
      0,
      SIZE,
      SCALE,
      box({ advance: 500, inkMinX: 0, inkMaxX: 500 }),
    );
    const b = computeGlyphOriginX(
      0,
      SIZE,
      SCALE,
      box({ advance: 500, inkMinX: 300, inkMaxX: 400 }),
    );
    expect(a).toBe(b);
  });

  it("centers the ink when the advance is zero (combining mark)", () => {
    // ink spans -250..50 units, its center is -100 units = -7.2px,
    // so the origin sits 7.2px right of the square's center
    const origin = computeGlyphOriginX(
      0,
      SIZE,
      SCALE,
      box({ advance: 0, inkMinX: -250, inkMaxX: 50 }),
    );
    expect(origin).toBeCloseTo(36 + 7.2);
  });

  it("puts the origin in the middle for an empty glyph with a zero advance", () => {
    const origin = computeGlyphOriginX(
      0,
      SIZE,
      SCALE,
      box({ advance: 0, inkMinX: 0, inkMaxX: 0 }),
    );
    expect(origin).toBeCloseTo(36);
  });
});

describe("computeGlyphBaselineY", () => {
  it("puts the baseline `ascent` below the square's top edge (Noto: 880 / 1000 x 72px)", () => {
    expect(computeGlyphBaselineY(0, (880 * 72) / 1000)).toBeCloseTo(63.36);
  });
});
