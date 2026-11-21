import { describe, expect, it } from "vitest";
import {
  multiplesIn,
  RULER_MIN_SPACING,
  rulerMinorStep,
  rulerStep,
} from "./ruler.ts";

describe("rulerStep", () => {
  it("is 1, 2 or 5 times a power of ten", () => {
    for (const scale of [0.02, 0.07, 0.3, 0.5, 1, 4, 20, 128]) {
      const step = rulerStep(scale);
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5]).toContain(Math.round(mantissa * 1e6) / 1e6);
    }
  });

  it("keeps the marks at least the least distance apart, and not far more", () => {
    for (const scale of [0.02, 0.07, 0.3, 0.5, 1, 4, 20, 128]) {
      const pixels = rulerStep(scale) * scale;
      expect(pixels).toBeGreaterThanOrEqual(RULER_MIN_SPACING - 1e-9);
      expect(pixels).toBeLessThan(RULER_MIN_SPACING * 2.5);
    }
  });

  it("gives 200 for a 1000-unit em fitted in about 600 pixels", () => {
    expect(rulerStep(0.46)).toBe(200);
  });

  it("goes below one unit when zoomed far in", () => {
    expect(rulerStep(1000)).toBeLessThan(1);
  });
});

describe("rulerMinorStep", () => {
  it("divides the step into whole, round parts", () => {
    expect(rulerMinorStep(100)).toBe(20);
    expect(rulerMinorStep(200)).toBe(50);
    expect(rulerMinorStep(500)).toBe(100);
  });
});

describe("multiplesIn", () => {
  it("lists the multiples inside the range, ends included", () => {
    expect(multiplesIn(-150, 450, 200)).toEqual([0, 200, 400]);
    expect(multiplesIn(0, 400, 200)).toEqual([0, 200, 400]);
  });

  it("is empty when no multiple is inside", () => {
    expect(multiplesIn(10, 90, 100)).toEqual([]);
  });
});
