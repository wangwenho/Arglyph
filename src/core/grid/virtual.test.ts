import { describe, expect, it } from "vitest";
import { computeCardLayout } from "./layout.ts";
import {
  computeAnchoredScrollTop,
  computeVisibleRange,
  decideLayout,
  type ViewportMeasure,
} from "./virtual.ts";

// Cards of exactly 72px: `cols` columns, 96px high.
const layoutOf = (cols: number) => computeCardLayout(cols * 72 + 1, 72);

describe("computeVisibleRange", () => {
  it("computes the visible range when scrolled to the middle", () => {
    const result = computeVisibleRange({
      scrollTop: 1000,
      viewportHeight: 600,
      layout: layoutOf(8),
      itemCount: 50848,
      overscan: 1,
    });

    expect(result.totalRows).toBe(6356);
    expect(result.firstRow).toBe(9); // floor(1000 / 96) = 10, minus overscan
    expect(result.lastRow).toBe(18); // ceil(1600 / 96) = 17, plus overscan
  });

  it("clamps the range to the first and last row", () => {
    const top = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 600,
      layout: layoutOf(8),
      itemCount: 20,
      overscan: 1,
    });
    expect(top.firstRow).toBe(0);
    expect(top.lastRow).toBe(2); // 20 items / 8 cols = 3 rows

    const empty = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 600,
      layout: layoutOf(8),
      itemCount: 0,
      overscan: 1,
    });
    expect(empty.totalRows).toBe(0);
    expect(empty.lastRow).toBe(-1);
  });
});

describe("computeAnchoredScrollTop", () => {
  it("keeps the scroll position when nothing changed", () => {
    // A mid-row scrollTop must not snap to a row start.
    expect(
      computeAnchoredScrollTop({
        scrollTop: 1000,
        previous: layoutOf(8),
        next: layoutOf(8),
      }),
    ).toBe(1000);
  });

  it("scales the position with the row height when only the card size changed", () => {
    // 8 columns either way, but 75px cards (25 + 75 = 100px rows) instead of 72px
    const bigger = computeCardLayout(8 * 75 + 1, 72);
    expect(bigger.cols).toBe(8);
    expect(bigger.cardHeight).toBe(100);

    expect(
      computeAnchoredScrollTop({
        scrollTop: 1000,
        previous: layoutOf(8),
        next: bigger,
      }),
    ).toBe(Math.round((1000 * 100) / 96));
  });

  it("anchors on the first glyph of the top row when columns change", () => {
    // 4 columns, scrolled to row 25 -> anchor glyph 100.
    // 10 columns: glyph 100 is in row 10.
    expect(
      computeAnchoredScrollTop({
        scrollTop: 25 * 96,
        previous: layoutOf(4),
        next: layoutOf(10),
      }),
    ).toBe(10 * 96);
  });

  it("returns 0 at the top regardless of the new layout", () => {
    expect(
      computeAnchoredScrollTop({
        scrollTop: 0,
        previous: layoutOf(1),
        next: layoutOf(10),
      }),
    ).toBe(0);
  });
});

describe("decideLayout", () => {
  const last: ViewportMeasure = {
    width: 800,
    height: 600,
    devicePixelRatio: 2,
    targetSize: 72,
  };

  it("skips a hidden (0x0) viewport", () => {
    expect(
      decideLayout({
        current: { ...last, width: 0, height: 0 },
        last,
        resetPending: false,
      }),
    ).toBe("skip");
  });

  it("keeps a pending reset while hidden, then resets at the same size", () => {
    const hidden = decideLayout({
      current: { ...last, width: 0, height: 0 },
      last,
      resetPending: true,
    });
    expect(hidden).toBe("skip");

    // Shown again at exactly the size it had before: must still reset.
    const shown = decideLayout({
      current: { ...last },
      last,
      resetPending: true,
    });
    expect(shown).toBe("reset");
  });

  it("skips when size, pixel ratio and target size did not change", () => {
    expect(
      decideLayout({ current: { ...last }, last, resetPending: false }),
    ).toBe("skip");
  });

  it("keeps the position when only the height, the pixel ratio or the target size changed", () => {
    for (const change of [
      { height: 700 },
      { devicePixelRatio: 1 },
      { targetSize: 96 },
    ]) {
      expect(
        decideLayout({
          current: { ...last, ...change },
          last,
          resetPending: false,
        }),
      ).toBe("keep-position");
    }
  });
});
