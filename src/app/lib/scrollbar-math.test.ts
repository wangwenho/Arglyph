import { describe, expect, it } from "vitest";
import { MIN_THUMB, scrollFor, thumbFor } from "./scrollbar-math.ts";

describe("thumbFor", () => {
  it("has no thumb when everything fits", () => {
    expect(thumbFor(500, 500, 0, 500)).toBeNull();
    expect(thumbFor(500, 400, 0, 500)).toBeNull();
    expect(thumbFor(500, 1000, 0, 0)).toBeNull();
  });

  it("is as long as the share of the content that is seen", () => {
    expect(thumbFor(500, 1000, 0, 500)).toEqual({ size: 250, offset: 0 });
  });

  it("reaches the end of the track at the end of the content", () => {
    expect(thumbFor(500, 1000, 500, 500)).toEqual({ size: 250, offset: 250 });
    // Past the end (overscroll) it stays on the track.
    expect(thumbFor(500, 1000, 900, 500)).toEqual({ size: 250, offset: 250 });
    expect(thumbFor(500, 1000, -20, 500)).toEqual({ size: 250, offset: 0 });
  });

  it("never gets smaller than a thumb that can be grabbed", () => {
    expect(thumbFor(500, 1_000_000, 0, 500)?.size).toBe(MIN_THUMB);
  });
});

describe("scrollFor", () => {
  it("is the inverse of thumbFor", () => {
    const thumb = thumbFor(500, 3000, 1234, 500);
    expect(thumb).not.toBeNull();
    if (!thumb) return;
    expect(scrollFor(thumb.offset, 500, 3000, 500, thumb.size)).toBeCloseTo(
      1234,
    );
  });

  it("stays inside the content", () => {
    expect(scrollFor(-50, 500, 1000, 500, 250)).toBe(0);
    expect(scrollFor(900, 500, 1000, 500, 250)).toBe(500);
    expect(scrollFor(10, 500, 1000, 500, 500)).toBe(0);
  });
});
