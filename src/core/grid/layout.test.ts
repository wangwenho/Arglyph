import { describe, expect, it } from "vitest";
import {
  type CardLayout,
  computeCardLayout,
  computeCardX,
  computeCardY,
  computeCol,
  computeRevealScrollTop,
  computeRow,
  computeSquareY,
  hitTest,
  labelFontSize,
  MIN_TARGET_SIZE,
  snapToPixelCenter,
  stepTargetSize,
} from "./layout.ts";

// 8 columns of exactly 72px: the card is 72 wide, 24 + 72 = 96 high.
// (One more pixel of width keeps the closing line of the last column inside.)
const layout: CardLayout = computeCardLayout(8 * 72 + 1, 72);

describe("computeCardLayout", () => {
  it("uses the target size when the width is an exact multiple of it", () => {
    expect(layout).toEqual({
      cols: 8,
      size: 72,
      labelHeight: 24,
      cardHeight: 96,
    });
  });

  it("grows the cards to fill the width instead of leaving a strip at the side", () => {
    // 1278 / 72 = 17.75: 17 columns; 1277 / 17 = 75.1 -> 75 wide cards
    const wide = computeCardLayout(1278, 72);

    expect(wide.cols).toBe(17);
    expect(wide.size).toBe(75);
    expect(1278 - wide.cols * wide.size).toBeLessThanOrEqual(wide.cols);
  });

  it("leaves room for the closing line when the width is an exact multiple", () => {
    // 384 = 8 * 48 exactly: the line closing column 8 would be at x = 384, off the canvas
    const exact = computeCardLayout(384, 48);

    expect(exact.cols).toBe(7);
    expect(exact.cols * exact.size).toBeLessThan(384);
    // and the same when the target is a bigger size
    const big = computeCardLayout(810, 135);
    expect(big.cols * big.size).toBeLessThan(810);
  });

  it("never makes a card smaller than the target, and only slightly larger", () => {
    for (const target of [48, 72, 100, 128]) {
      for (let width = 300; width <= 2000; width += 7) {
        const l = computeCardLayout(width, target);
        expect(l.size).toBeGreaterThanOrEqual(target);
        // one more column would not have fitted, so the cards cannot be
        // a whole column's share larger than the target
        expect(l.size).toBeLessThan(target * (1 + 1 / l.cols) + 1);
        // one pixel stays free for the line that closes the last column
        expect(l.cols * l.size).toBeLessThanOrEqual(width - 1);
        expect(width - l.cols * l.size).toBeLessThanOrEqual(l.cols);
      }
    }
  });

  it("has at least one column, even in a viewport narrower than a card", () => {
    const narrow = computeCardLayout(20, 72);

    expect(narrow.cols).toBe(1);
    expect(narrow.size).toBe(MIN_TARGET_SIZE);
  });
});

describe("label and mark sizes", () => {
  it("an 8-character label still fits the narrowest card", () => {
    // U+10FFFF in a monospace font is about 0.6 em per character
    const width = 8 * labelFontSize(MIN_TARGET_SIZE) * 0.6;
    expect(width).toBeLessThan(MIN_TARGET_SIZE);
  });
});

describe("card positions", () => {
  it("make neighbouring cards touch, with no gap, and put the square under the label strip", () => {
    expect(computeCardX(5, layout) - computeCardX(4, layout)).toBe(layout.size);
    expect(computeCardY(5, 100, layout) - computeCardY(4, 100, layout)).toBe(
      layout.cardHeight,
    );
    expect(computeCardY(3, 0, layout) - computeCardY(3, 50, layout)).toBe(50); // scrolling moves them up
    expect(computeSquareY(0, layout) + layout.size).toBe(layout.cardHeight);
  });
});

describe("snapToPixelCenter", () => {
  it("moves an integer coordinate to the middle of its pixel", () => {
    expect(snapToPixelCenter(10)).toBe(10.5);
  });

  it("floors negative coordinates (cards scrolled off the top)", () => {
    expect(snapToPixelCenter(-0.3)).toBe(-0.5);
  });
});

describe("hitTest", () => {
  const count = 20; // rows 0-1 are full, row 2 has 4 items

  it("is the inverse of computeCardX / computeCardY at every card size (round trip)", () => {
    for (const width of [576, 1278, 1000, 640]) {
      for (const target of [48, 72, 128]) {
        const l = computeCardLayout(width, target);
        for (const index of [0, 1, l.cols - 1, l.cols, 13, 19]) {
          const x = computeCardX(computeCol(index, l.cols), l);
          const y = computeCardY(computeRow(index, l.cols), 0, l);
          expect(hitTest(x, y, l, 40)).toBe(index);
          expect(hitTest(x + l.size / 2, y + l.cardHeight / 2, l, 40)).toBe(
            index,
          );
          expect(hitTest(x + l.size - 1, y + l.cardHeight - 1, l, 40)).toBe(
            index,
          );
        }
      }
    }
  });

  it("belongs to the next card from the first pixel of the next cell", () => {
    expect(hitTest(layout.size, 0, layout, count)).toBe(1);
    expect(hitTest(0, layout.cardHeight, layout, count)).toBe(layout.cols);
  });

  it("returns -1 outside the grid, including the few pixels left over at the right", () => {
    expect(hitTest(-1, 5, layout, count)).toBe(-1);
    expect(hitTest(5, -1, layout, count)).toBe(-1);
    expect(hitTest(layout.cols * layout.size, 5, layout, count)).toBe(-1);
  });

  it("returns -1 past the last item, in the partial last row", () => {
    const lastX = 3 * layout.size + 1;
    const lastY = 2 * layout.cardHeight + 1;
    expect(hitTest(lastX, lastY, layout, count)).toBe(19);
    expect(hitTest(lastX + layout.size, lastY, layout, count)).toBe(-1);
    expect(hitTest(1, 3 * layout.cardHeight + 1, layout, count)).toBe(-1);
  });
});

describe("computeRevealScrollTop", () => {
  const four = computeCardLayout(4 * 72 + 1, 72);
  const viewport = 3 * four.cardHeight;

  it("does not move when the card is already fully visible", () => {
    expect(computeRevealScrollTop(four.cols, four, 0, viewport)).toBe(0);
  });

  it("scrolls up just enough to show a card above the viewport", () => {
    expect(computeRevealScrollTop(0, four, 500, viewport)).toBe(0);
    expect(computeRevealScrollTop(four.cols * 2, four, 500, viewport)).toBe(
      2 * four.cardHeight,
    );
  });

  it("scrolls down just enough to show a card below the viewport", () => {
    expect(computeRevealScrollTop(four.cols * 5, four, 0, viewport)).toBe(
      6 * four.cardHeight - viewport,
    );
  });

  it("treats a card that sticks out of the bottom as not visible", () => {
    const short = 3 * four.cardHeight - 20;
    expect(computeRevealScrollTop(four.cols * 2, four, 0, short)).toBe(
      3 * four.cardHeight - short,
    );
  });

  it("shows the top of the card when the viewport is shorter than a card", () => {
    expect(
      computeRevealScrollTop(four.cols * 2, four, 0, four.cardHeight - 10),
    ).toBe(2 * four.cardHeight);
  });
});

describe("stepTargetSize", () => {
  const width = 8 * 72 + 1;

  it("goes to one column fewer for bigger cards, and the target is that card's size", () => {
    const next = stepTargetSize(width, 72, 1);
    expect(next).toBe(82);
    expect(computeCardLayout(width, next as number)).toMatchObject({
      cols: 7,
      size: 82,
    });
  });

  it("goes to one column more for smaller cards", () => {
    const next = stepTargetSize(width, 72, -1);
    expect(next).toBe(64);
    expect(computeCardLayout(width, next as number)).toMatchObject({
      cols: 9,
      size: 64,
    });
  });

  it("steps from the real size, not from a target the width stretched", () => {
    // A target of 80 makes 7 columns of 82 here (stretched): smaller is 8
    // columns of 72, whatever the target was.
    expect(stepTargetSize(width, 80, -1)).toBe(72);
    expect(stepTargetSize(width, 80, 1)).toBe(96);
  });

  it("makes every step a visible one, and a step back leads home", () => {
    let target = 128;
    const seen: number[] = [];
    for (let i = 0; i < 40; i++) {
      const next = stepTargetSize(1000, target, -1);
      if (next === null) break;
      expect(next).toBeLessThan(computeCardLayout(1000, target).size);
      seen.push(next);
      target = next;
    }
    expect(seen.at(-1)).toBeGreaterThanOrEqual(MIN_TARGET_SIZE);
    expect(stepTargetSize(1000, seen.at(-1) as number, -1)).toBeNull();
    const up = stepTargetSize(1000, seen[1], 1);
    expect(up).toBe(seen[0]);
  });

  it("stops at the biggest and the smallest card", () => {
    expect(stepTargetSize(width, 128, 1)).toBeNull();
    expect(stepTargetSize(width, MIN_TARGET_SIZE, -1)).toBeNull();
    // One column of 300 pixels: it cannot get bigger than the range allows.
    expect(stepTargetSize(301, 128, 1)).toBeNull();
  });
});
