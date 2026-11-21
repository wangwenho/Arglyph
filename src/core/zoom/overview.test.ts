import { describe, expect, it } from "vitest";
import type { GlyphBox } from "../glyph/origin.ts";
import {
  centerOnOverviewPoint,
  OVERVIEW_MAX_HEIGHT,
  OVERVIEW_MAX_WIDTH,
  type OverviewInput,
  overviewLayout,
} from "./overview.ts";
import { fitTransform } from "./view-transform.ts";

const GLYPH: GlyphBox = {
  advance: 600,
  inkMinX: 40,
  inkMaxX: 560,
  inkMinY: -700,
  inkMaxY: 0,
};

function input(factor: number, glyph = GLYPH): OverviewInput {
  const fit = fitTransform({
    width: 800,
    height: 600,
    unitsPerEm: 1000,
    ascender: 880,
    glyph,
  });
  return {
    width: 800,
    height: 600,
    transform: {
      scale: fit.scale * factor,
      // Zoom around the center of the view.
      x: 400 - (400 - fit.x) * factor,
      y: 300 - (300 - fit.y) * factor,
    },
    unitsPerEm: 1000,
    ascender: 880,
    glyph,
  };
}

describe("overviewLayout", () => {
  it("fits the overview into its largest size", () => {
    const layout = overviewLayout(input(1));
    expect(layout.width).toBeLessThanOrEqual(OVERVIEW_MAX_WIDTH);
    expect(layout.height).toBeLessThanOrEqual(OVERVIEW_MAX_HEIGHT);
    expect(
      layout.width === OVERVIEW_MAX_WIDTH ||
        layout.height === OVERVIEW_MAX_HEIGHT,
    ).toBe(true);
  });

  it("is not needed while the whole glyph is in view", () => {
    expect(overviewLayout(input(1)).needed).toBe(false);
    expect(overviewLayout(input(0.1)).needed).toBe(false);
  });

  it("is needed once the view is closer than the em square", () => {
    expect(overviewLayout(input(2)).needed).toBe(true);
  });

  it("shows a viewport that covers the em square at the fitted zoom", () => {
    const { viewport, square } = overviewLayout(input(1));
    expect(viewport.left).toBeLessThan(square.left);
    expect(viewport.right).toBeGreaterThan(square.right);
  });

  it("makes the viewport smaller as the view zooms in", () => {
    const wide = overviewLayout(input(1)).viewport;
    const near = overviewLayout(input(4)).viewport;
    expect(near.right - near.left).toBeCloseTo((wide.right - wide.left) / 4);
  });

  it("includes ink that sticks out of the em square", () => {
    const tall = { ...GLYPH, inkMinY: -1400 };
    const small = overviewLayout(input(1)).scale;
    expect(overviewLayout(input(1, tall)).scale).toBeLessThan(small);
  });
});

describe("centerOnOverviewPoint", () => {
  it("puts the point under the click at the center of the view", () => {
    const base = input(4);
    const layout = overviewLayout(base);
    const x = layout.square.left + 10;
    const y = layout.square.top + 20;
    const next = centerOnOverviewPoint(base, layout, x, y);
    expect(next.scale).toBe(base.transform.scale);
    // The same point, found again from the new transform.
    const after = overviewLayout({ ...base, transform: next });
    const centerX = (after.viewport.left + after.viewport.right) / 2;
    const centerY = (after.viewport.top + after.viewport.bottom) / 2;
    expect(centerX).toBeCloseTo(x);
    expect(centerY).toBeCloseTo(y);
  });
});
