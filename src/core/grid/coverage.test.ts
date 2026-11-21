import { describe, expect, it } from "vitest";
import { describeCoverage, formatPercent } from "./coverage.ts";

describe("describeCoverage", () => {
  it("splits the block into the four states, which add up to the whole", () => {
    const c = describeCoverage({
      drawn: 60,
      blank: 5,
      undrawn: 15,
      missing: 20,
    });
    expect(c.total).toBe(100);
    expect(c.drawnFraction).toBeCloseTo(0.6);
    expect(c.blankFraction).toBeCloseTo(0.05);
    expect(c.undrawnFraction).toBeCloseTo(0.15);
    expect(c.missingFraction).toBeCloseTo(0.2);
    expect(
      c.drawnFraction + c.blankFraction + c.undrawnFraction + c.missingFraction,
    ).toBeCloseTo(1);
  });

  it("has no shares for an empty block instead of dividing by zero", () => {
    const c = describeCoverage({ drawn: 0, blank: 0, undrawn: 0, missing: 0 });
    expect(c.total).toBe(0);
    expect(c.drawnFraction).toBe(0);
    expect(c.missingFraction).toBe(0);
  });
});

describe("formatPercent", () => {
  it("rounds, but keeps 0% and 100% for exactly those", () => {
    expect(formatPercent(0.734)).toBe("73%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.999)).toBe("99%");
    expect(formatPercent(0.001)).toBe("1%");
  });
});
