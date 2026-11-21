import { describe, expect, it } from "vitest";
import { computeCardLayout } from "./layout.ts";
import { firstVisibleIndex, moveSelection } from "./navigation.ts";

const layout = computeCardLayout(4 * 72 + 1, 72);
const cols = layout.cols;
const CARD_HEIGHT = layout.cardHeight;
const count = 10; // rows: 0-3, 4-7, 8-9

describe("moveSelection", () => {
  it("moves one item left and right", () => {
    expect(moveSelection(5, "left", cols, count)).toBe(4);
    expect(moveSelection(5, "right", cols, count)).toBe(6);
  });

  it("wraps to the neighbouring row at the row ends, like reading order", () => {
    expect(moveSelection(4, "left", cols, count)).toBe(3);
    expect(moveSelection(3, "right", cols, count)).toBe(4);
  });

  it("stops at the first and last item", () => {
    expect(moveSelection(0, "left", cols, count)).toBe(0);
    expect(moveSelection(count - 1, "right", cols, count)).toBe(count - 1);
  });

  it("moves one row up and down", () => {
    expect(moveSelection(5, "up", cols, count)).toBe(1);
    expect(moveSelection(5, "down", cols, count)).toBe(9);
  });

  it("goes to the last item going down into a shorter last row", () => {
    // column 3 has no item in row 2 (only 8 and 9 exist)
    expect(moveSelection(7, "down", cols, count)).toBe(9);
  });

  it("stays put going down from the last row", () => {
    expect(moveSelection(9, "down", cols, count)).toBe(9);
    expect(moveSelection(8, "down", cols, count)).toBe(8);
  });
});

describe("firstVisibleIndex", () => {
  it("is the first item when not scrolled", () => {
    expect(firstVisibleIndex(0, layout, count)).toBe(0);
  });

  it("skips a row that is only partly visible at the top", () => {
    expect(firstVisibleIndex(CARD_HEIGHT + 1, layout, count)).toBe(2 * cols);
  });

  it("keeps a row that is exactly at the top", () => {
    expect(firstVisibleIndex(CARD_HEIGHT, layout, count)).toBe(cols);
  });

  it("never goes past the last item", () => {
    expect(firstVisibleIndex(100 * CARD_HEIGHT, layout, count)).toBe(count - 1);
  });
});
