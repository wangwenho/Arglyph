import { clamp } from "../math.ts";
// Where each card sits in the grid.
//
// A card is a label strip on top of the glyph's em square. Cards touch each
// other: there is no gap, so a card is exactly one cell of the grid.
//
// The size of a card is not fixed. The user picks a *target* size; the number of
// columns is whatever fits at that size, and the cards are then made as big as
// it takes to fill the width, so no strip of unused space is left at the side
// (see `computeCardLayout`). Rendering, hit-testing, keyboard navigation and the
// zoom view must all agree on these numbers, so they live in one place.
//
// All functions return plain numbers and allocate nothing: they run once per
// visible glyph on every frame.

/** The size the user starts with, in CSS pixels, and the range of the slider. */
export const DEFAULT_TARGET_SIZE = 72;
export const MIN_TARGET_SIZE = 48;
export const MAX_TARGET_SIZE = 128;

/** The measurements of one card and how many fit in a row. */
export interface CardLayout {
  cols: number;
  /** Side of the em square, which is also the card's width. Whole pixels. */
  size: number;
  /** Height of the label strip: a third of the square. Whole pixels. */
  labelHeight: number;
  /** Height of a whole card: label strip + square. */
  cardHeight: number;
}

/**
 * The layout for a grid `width` pixels wide when the user wants cards of about
 * `targetSize`. As many columns as fit at the target size, then the cards grow
 * to fill the width: they end up at most a few percent larger than the target.
 * One pixel is kept free for the line that closes the last column (a card owns
 * its left and top line; the right line sits one pixel into the next cell), so
 * at most `cols` pixels are left over. Sizes are whole pixels so the 1px lines
 * stay sharp.
 */
export function computeCardLayout(
  width: number,
  targetSize: number,
): CardLayout {
  const target = Math.max(MIN_TARGET_SIZE, targetSize);
  // Both the number of columns and their size are worked out for one pixel less
  // than the width, which keeps that pixel free for the closing line.
  const usable = Math.max(0, width - 1);
  const cols = Math.max(1, Math.floor(usable / target));
  const size = Math.max(MIN_TARGET_SIZE, Math.floor(usable / cols));
  const labelHeight = Math.floor(size / 3);
  return { cols, size, labelHeight, cardHeight: labelHeight + size };
}

/**
 * The target size for the next card size when the user steps the size:
 * `direction` 1 is bigger cards, which means one column fewer, -1 smaller ones
 * and one column more. The target is the size that card would be, so that the
 * number the user sees is the real one. null when there is no such size: the
 * grid is as big or as small as it may be, or no whole size gives that many
 * columns in so narrow a grid.
 */
export function stepTargetSize(
  width: number,
  targetSize: number,
  direction: -1 | 1,
): number | null {
  const { cols, size } = computeCardLayout(width, targetSize);
  const wanted = cols - direction;
  if (wanted < 1) return null;
  if (direction > 0 && size >= MAX_TARGET_SIZE) return null;
  if (direction < 0 && size <= MIN_TARGET_SIZE) return null;
  const next = Math.floor(Math.max(0, width - 1) / wanted);
  if (next < MIN_TARGET_SIZE || next > MAX_TARGET_SIZE) return null;
  const made = computeCardLayout(width, next);
  return made.cols === wanted && made.size === next ? next : null;
}

/** Font size of the label text: grows with the card, within a readable range. */
export function labelFontSize(size: number): number {
  return clamp(Math.round(size / 7.2), 9, 13);
}

/** Side of the triangle that marks a glyph sticking out of its square. */
export function clippedMarkSize(size: number): number {
  return Math.max(6, Math.round(size / 9));
}

/** Row of the glyph at `index` in a grid with `cols` columns. */
export function computeRow(index: number, cols: number): number {
  return Math.floor(index / cols);
}

/** Column of the glyph at `index` in a grid with `cols` columns. */
export function computeCol(index: number, cols: number): number {
  return index % cols;
}

/** Left edge of the card in `col`, relative to the grid's left edge. */
export function computeCardX(col: number, layout: CardLayout): number {
  return col * layout.size;
}

/**
 * Top edge of the card in `row`, relative to the top of the viewport when the
 * content is scrolled by `scrollTop`. Negative for cards scrolled off the top.
 */
export function computeCardY(
  row: number,
  scrollTop: number,
  layout: CardLayout,
): number {
  return row * layout.cardHeight - scrollTop;
}

/** Top edge of the em square inside a card whose top edge is `cardY`. */
export function computeSquareY(cardY: number, layout: CardLayout): number {
  return cardY + layout.labelHeight;
}

/**
 * Snap a coordinate to the center of a CSS pixel, so a 1px line drawn there
 * covers exactly one pixel row (or column) instead of blurring into two.
 * Exact at a device pixel ratio of 1 or 2; fractional ratios stay slightly soft.
 */
export function snapToPixelCenter(coord: number): number {
  return Math.floor(coord) + 0.5;
}

/**
 * The card under a point, as an index into the grid, or -1 when the point is
 * not over any card (past the last column, past the last item, or negative).
 * `x` is relative to the grid's left edge and `y` to the top of the whole
 * content (so it already includes the scroll offset): the exact inverse of
 * `computeCardX` / `computeCardY` for `scrollTop = 0`.
 */
export function hitTest(
  x: number,
  y: number,
  layout: CardLayout,
  itemCount: number,
): number {
  if (x < 0 || y < 0) return -1;
  const col = Math.floor(x / layout.size);
  if (col >= layout.cols) return -1;
  const index = Math.floor(y / layout.cardHeight) * layout.cols + col;
  return index < itemCount ? index : -1;
}

/**
 * The scroll offset that makes the card at `index` fully visible with the least
 * movement: unchanged when it already is, otherwise the card is brought to the
 * nearest edge. A viewport shorter than a card shows the card's top.
 */
export function computeRevealScrollTop(
  index: number,
  layout: CardLayout,
  scrollTop: number,
  viewportHeight: number,
): number {
  const top = computeRow(index, layout.cols) * layout.cardHeight;
  if (top < scrollTop || viewportHeight < layout.cardHeight) return top;
  const bottom = top + layout.cardHeight;
  return bottom > scrollTop + viewportHeight
    ? bottom - viewportHeight
    : scrollTop;
}
