import { describe, expect, it } from "vitest";
import {
  computeGlyphOriginX,
  computeSquareX,
  type GlyphBox,
} from "../glyph/origin.ts";
import {
  fitScale,
  fitTransform,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  resizeAround,
  zoomAt,
  zoomLimits,
} from "./view-transform.ts";

const GLYPH: GlyphBox = {
  advance: 1000,
  inkMinX: 50,
  inkMaxX: 950,
  inkMinY: -800,
  inkMaxY: 100,
};

describe("fitTransform", () => {
  const fit = fitTransform({
    width: 800,
    height: 600,
    unitsPerEm: 1000,
    ascender: 880,
    glyph: GLYPH,
  });

  it("fits the em square into the shorter side with a margin", () => {
    expect(fit.scale).toBeCloseTo(fitScale(800, 600, 1000));
    expect(fit.scale * 1000).toBeLessThan(600);
  });

  it("centers the em square in the view", () => {
    const size = 1000 * fit.scale;
    const squareX = computeSquareX(fit.x, size, fit.scale, GLYPH);
    const squareY = fit.y - 880 * fit.scale;
    expect(squareX + size / 2).toBeCloseTo(400);
    expect(squareY + size / 2).toBeCloseTo(300);
  });

  it("puts a half-width glyph's advance box in the middle", () => {
    const narrow = { ...GLYPH, advance: 500 };
    const t = fitTransform({
      width: 800,
      height: 600,
      unitsPerEm: 1000,
      ascender: 880,
      glyph: narrow,
    });
    expect(t.x + (500 * t.scale) / 2).toBeCloseTo(400);
  });
});

describe("computeSquareX", () => {
  it("undoes computeGlyphOriginX", () => {
    for (const glyph of [
      GLYPH,
      { ...GLYPH, advance: 500 },
      { ...GLYPH, advance: 0 },
    ]) {
      const origin = computeGlyphOriginX(30, 72, 0.072, glyph);
      expect(computeSquareX(origin, 72, 0.072, glyph)).toBeCloseTo(30);
    }
  });
});

describe("zoomAt", () => {
  const start = { scale: 0.5, x: 100, y: 200 };

  it("keeps the point under the pointer where it is", () => {
    const anchor = { x: 340, y: 120 };
    const next = zoomAt(start, anchor.x, anchor.y, 2.5, 0.01, 100);
    // The font-space point under the anchor before and after.
    const before = {
      x: (anchor.x - start.x) / start.scale,
      y: (anchor.y - start.y) / start.scale,
    };
    const after = {
      x: (anchor.x - next.x) / next.scale,
      y: (anchor.y - next.y) / next.scale,
    };
    expect(next.scale).toBeCloseTo(1.25);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("stops at the limits", () => {
    expect(zoomAt(start, 0, 0, 1000, 0.1, 2).scale).toBe(2);
    expect(zoomAt(start, 0, 0, 0.0001, 0.1, 2).scale).toBe(0.1);
  });

  it("does not move the glyph when the limit is already reached", () => {
    const atMax = { scale: 2, x: 10, y: 20 };
    expect(zoomAt(atMax, 50, 60, 3, 0.1, 2)).toEqual(atMax);
  });
});

describe("panBy and resizeAround", () => {
  it("panBy moves the origin and keeps the scale", () => {
    expect(panBy({ scale: 2, x: 1, y: 2 }, 10, -5)).toEqual({
      scale: 2,
      x: 11,
      y: -3,
    });
  });

  it("resizeAround keeps the center of the view", () => {
    const next = resizeAround({ scale: 1, x: 100, y: 100 }, 200, -100);
    expect(next).toEqual({ scale: 1, x: 200, y: 50 });
  });
});

describe("zoomLimits", () => {
  it("is relative to the fitted scale", () => {
    expect(zoomLimits(0.4)).toEqual({
      min: 0.4 * MIN_ZOOM,
      max: 0.4 * MAX_ZOOM,
    });
  });
});
