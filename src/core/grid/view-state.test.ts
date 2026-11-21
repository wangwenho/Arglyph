import { describe, expect, it } from "vitest";
import { computeCardLayout } from "./layout.ts";
import { buildGridModel } from "./model.ts";
import {
  captureViewState,
  restoreScrollTop,
  restoreSelectedIndex,
} from "./view-state.ts";

// 100 mapped code points U+1000..U+1063, no unmapped glyph (gid = index)
function modelOf(codepoints: number[]) {
  const map: Record<number, number> = {};
  codepoints.forEach((cp, glyph) => {
    map[cp] = glyph;
  });
  return buildGridModel(map, codepoints.length);
}
const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => from + i);
const layout = computeCardLayout(10 * 72 + 1, 72);
const cols = layout.cols;
const CARD_HEIGHT = layout.cardHeight;

describe("captureViewState", () => {
  const model = modelOf(range(0x1000, 100));

  it("anchors on the first item of the top row", () => {
    const state = captureViewState(model, layout, 3 * CARD_HEIGHT, -1);

    expect(state.anchorKey).toBe(0x1000 + 30);
    expect(state.anchorOffset).toBe(0);
  });

  it("has no anchor for an empty model", () => {
    const state = captureViewState(modelOf([]), layout, 0, -1);
    expect(state).toEqual({
      anchorKey: null,
      anchorOffset: 0,
      selectedKey: null,
    });
  });
});

describe("restoreScrollTop", () => {
  it("round-trips on the same model", () => {
    const model = modelOf(range(0x1000, 100));
    for (const scrollTop of [0, 5, 3 * CARD_HEIGHT + 17, 9 * CARD_HEIGHT]) {
      const state = captureViewState(model, layout, scrollTop, -1);
      expect(restoreScrollTop(model, layout, state)).toBe(scrollTop);
    }
  });

  it("keeps the same glyph at the top when glyphs were added before it", () => {
    const before = modelOf(range(0x1000, 100));
    const state = captureViewState(before, layout, 3 * CARD_HEIGHT, -1); // top: U+101E
    // 20 new code points below U+1000 push everything down two rows
    const after = modelOf([...range(0x800, 20), ...range(0x1000, 100)]);

    expect(restoreScrollTop(after, layout, state)).toBe(5 * CARD_HEIGHT);
  });

  it("keeps the anchor glyph in the top row even when it is no longer the first in its row", () => {
    const before = modelOf(range(0x1000, 100));
    const state = captureViewState(before, layout, 3 * CARD_HEIGHT, -1); // top: U+101E
    // 3 new code points push it to column 3 of the row, so the row starts earlier
    const after = modelOf([...range(0x800, 3), ...range(0x1000, 100)]);

    const scrollTop = restoreScrollTop(after, layout, state);
    const topRowStart = Math.floor(scrollTop / CARD_HEIGHT) * cols;
    const topRow = Array.from({ length: cols }, (_, i) =>
      after.keyAt(topRowStart + i),
    );
    expect(topRow).toContain(0x101e);
  });

  it("uses the next glyph when the anchor glyph was removed", () => {
    const before = modelOf(range(0x1000, 100));
    const state = captureViewState(before, layout, 3 * CARD_HEIGHT, -1); // top: U+101E
    const after = modelOf(range(0x1000, 100).filter((cp) => cp !== 0x101e));

    // U+101F now sits at index 30, still the first item of row 3
    expect(restoreScrollTop(after, layout, state)).toBe(3 * CARD_HEIGHT);
  });

  it("recomputes the row for a different number of columns", () => {
    const model = modelOf(range(0x1000, 100));
    const state = captureViewState(model, layout, 3 * CARD_HEIGHT, -1); // item 30

    expect(
      restoreScrollTop(model, computeCardLayout(5 * 72 + 1, 72), state),
    ).toBe(6 * CARD_HEIGHT);
  });

  it("is 0 without an anchor and clamps a nonsense offset", () => {
    const model = modelOf(range(0x1000, 100));
    const none = { anchorKey: null, anchorOffset: 50, selectedKey: null };
    expect(restoreScrollTop(model, layout, none)).toBe(0);

    const huge = {
      anchorKey: 0x1000 + 10,
      anchorOffset: 9999,
      selectedKey: null,
    };
    expect(restoreScrollTop(model, layout, huge)).toBe(
      CARD_HEIGHT + CARD_HEIGHT - 1,
    );
  });
});

describe("restoreSelectedIndex", () => {
  it("finds the selected glyph wherever it moved to", () => {
    const before = modelOf(range(0x1000, 100));
    const state = captureViewState(before, layout, 0, 42); // U+102A
    const after = modelOf([...range(0x800, 20), ...range(0x1000, 100)]);

    expect(restoreSelectedIndex(after, state)).toBe(62);
  });

  it("is -1 when the glyph is gone or nothing was selected", () => {
    const before = modelOf(range(0x1000, 100));
    const state = captureViewState(before, layout, 0, 42);
    const after = modelOf(range(0x1000, 100).filter((cp) => cp !== 0x102a));

    expect(restoreSelectedIndex(after, state)).toBe(-1);
    expect(
      restoreSelectedIndex(after, captureViewState(before, layout, 0, -1)),
    ).toBe(-1);
  });
});
