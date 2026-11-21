// Keyboard navigation over the grid: which item the arrow keys move to.

import type { CardLayout } from "./layout.ts";

export type NavDirection = "left" | "right" | "up" | "down";

/**
 * The item reached by pressing an arrow key on `index`. Moves stop at the
 * edges. Down from a column that has no item in the (shorter) last row goes to
 * the last item instead of nowhere, as in a file manager.
 */
export function moveSelection(
  index: number,
  direction: NavDirection,
  cols: number,
  count: number,
): number {
  switch (direction) {
    case "left":
      return Math.max(0, index - 1);
    case "right":
      return Math.min(count - 1, index + 1);
    case "up":
      return index - cols >= 0 ? index - cols : index;
    case "down": {
      if (index + cols < count) return index + cols;
      const onLastRow =
        Math.floor(index / cols) === Math.floor((count - 1) / cols);
      return onLastRow ? index : count - 1;
    }
  }
}

/**
 * The first item of the first row that is fully visible: where an arrow key
 * starts when nothing is selected yet.
 */
export function firstVisibleIndex(
  scrollTop: number,
  layout: CardLayout,
  count: number,
): number {
  const row = Math.ceil(scrollTop / layout.cardHeight);
  return Math.max(0, Math.min(row * layout.cols, count - 1));
}
