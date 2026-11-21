// A grid that draws only the rows in view: which rows those are, whether the
// layout has to be measured again, and where to scroll to when the layout
// changes.

import type { CardLayout } from "./layout.ts";

export interface VirtualGridInput {
  scrollTop: number;
  viewportHeight: number;
  layout: CardLayout;
  itemCount: number;
  overscan: number;
}

export interface VirtualGridResult {
  totalRows: number;
  firstRow: number;
  lastRow: number;
}

/**
 * The scrollTop to use after the layout changed (the viewport was resized, or
 * the user changed the glyph size).
 *
 * If the content did not reflow, the scroll position is kept. If the number of
 * columns is the same but the cards changed size, the position is scaled with
 * the row height so the same rows stay in view. Otherwise the first glyph of the
 * top row is used as an anchor and its new row is scrolled to the top, so the
 * user keeps looking at roughly the same glyphs.
 */
export function computeAnchoredScrollTop(input: {
  scrollTop: number;
  previous: CardLayout;
  next: CardLayout;
}): number {
  const { scrollTop, previous, next } = input;
  if (next.cols === previous.cols) {
    return next.cardHeight === previous.cardHeight
      ? scrollTop
      : Math.round((scrollTop * next.cardHeight) / previous.cardHeight);
  }
  const anchorIndex =
    Math.floor(scrollTop / previous.cardHeight) * previous.cols;
  return Math.floor(anchorIndex / next.cols) * next.cardHeight;
}

export interface ViewportMeasure {
  width: number;
  height: number;
  devicePixelRatio: number;
  /** The glyph size the user asked for (see computeCardLayout). */
  targetSize: number;
}

/**
 * What a layout pass should do:
 * - "skip": nothing to do (hidden, or nothing changed)
 * - "keep-position": re-measure and redraw, keep the scroll position
 * - "reset": re-measure and redraw from the top (a new font arrived)
 */
export type LayoutDecision = "skip" | "keep-position" | "reset";

export function decideLayout(input: {
  current: ViewportMeasure;
  last: ViewportMeasure;
  /** A new font is waiting for its first layout. */
  resetPending: boolean;
}): LayoutDecision {
  const { current, last, resetPending } = input;
  // A hidden panel measures 0x0. Resizing the canvas then would wipe it and
  // lose the scroll position, so wait until the panel is visible again.
  // `resetPending` is kept by the caller, so the pending reset still happens.
  if (current.width === 0 || current.height === 0) return "skip";
  if (resetPending) return "reset";
  if (
    current.width === last.width &&
    current.height === last.height &&
    current.devicePixelRatio === last.devicePixelRatio &&
    current.targetSize === last.targetSize
  ) {
    return "skip";
  }
  return "keep-position";
}

export function computeVisibleRange(
  input: VirtualGridInput,
): VirtualGridResult {
  const { scrollTop, viewportHeight, layout, itemCount, overscan } = input;
  const { cardHeight } = layout;

  const totalRows = Math.ceil(itemCount / layout.cols);
  const firstRow = Math.max(0, Math.floor(scrollTop / cardHeight) - overscan);
  const lastRow = Math.min(
    totalRows - 1,
    Math.ceil((scrollTop + viewportHeight) / cardHeight) + overscan,
  );

  return { totalRows, firstRow, lastRow };
}
