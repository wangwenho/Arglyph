import { describe, expect, it } from "vitest";
import { isGlyphClipped } from "./clipped.ts";
import type { GlyphBox } from "./origin.ts";

// 1000 units per em drawn in a 72px square whose top-left corner is (0, 0);
// the baseline is 60px below the top.
const SCALE = 72 / 1000;
const SIZE = 72;
const BASELINE = 60;

function box(overrides: Partial<GlyphBox>): GlyphBox {
  return {
    advance: 1000,
    inkMinX: 50,
    inkMaxX: 950,
    inkMinY: -800,
    inkMaxY: 50,
    ...overrides,
  };
}

function clips(glyph: GlyphBox, originX = 0): boolean {
  return isGlyphClipped(glyph, SCALE, originX, BASELINE, 0, 0, SIZE);
}

describe("isGlyphClipped", () => {
  it("is false for a glyph that fits", () => {
    expect(clips(box({}))).toBe(false);
  });

  it("is true when the ink sticks out on any side", () => {
    expect(clips(box({ inkMinX: -100 }))).toBe(true); // left
    expect(clips(box({ inkMaxX: 1100 }))).toBe(true); // right
    expect(clips(box({ inkMinY: -900 }))).toBe(true); // above: 60 - 64.8 px (tall accents)
    expect(clips(box({ inkMaxY: 200 }))).toBe(true); // below: 60 + 14.4 = 74.4 px (descenders)
  });

  it("depends on where the glyph is drawn, not only on its size", () => {
    expect(clips(box({}), 10)).toBe(true);
  });

  it("ignores overshoot below half a pixel", () => {
    // right edge at 1000 * 0.072 = 72px exactly; 0.3px more is tolerated
    expect(clips(box({ inkMaxX: 1004 }))).toBe(false);
  });

  it("is false for a glyph without ink (space)", () => {
    expect(
      clips(box({ inkMinX: 0, inkMaxX: 0, inkMinY: 0, inkMaxY: 0 }), 500),
    ).toBe(false);
  });
});
