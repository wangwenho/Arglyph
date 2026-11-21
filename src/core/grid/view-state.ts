// What the view remembers about where the user was, in terms that still make
// sense after the font changed.
//
// A pixel offset or an item index points at *a place*; after a reload the same
// place may show a different glyph. So the state names *items* by their key
// (see GridModel.keyAt): which glyph is selected, and which glyph was at the top
// of the window. Restoring finds those items again, wherever they ended up.

import type { CardLayout } from "./layout.ts";
import type { GridModel } from "./model.ts";

export interface ViewState {
  /** Key of the first item in the top visible row; null when there is none. */
  anchorKey: number | null;
  /** How far the window is scrolled into that row, in pixels. */
  anchorOffset: number;
  /** Key of the selected item; null when nothing is selected. */
  selectedKey: number | null;
}

/** Describe the current position of a view showing `model` with `layout`. */
export function captureViewState(
  model: GridModel,
  layout: CardLayout,
  scrollTop: number,
  selectedIndex: number,
): ViewState {
  const selectedKey = selectedIndex >= 0 ? model.keyAt(selectedIndex) : null;
  if (model.count === 0) {
    return { anchorKey: null, anchorOffset: 0, selectedKey };
  }
  const row = Math.floor(scrollTop / layout.cardHeight);
  const anchorIndex = Math.min(row * layout.cols, model.count - 1);
  return {
    anchorKey: model.keyAt(anchorIndex),
    anchorOffset: scrollTop - row * layout.cardHeight,
    selectedKey,
  };
}

/**
 * The scroll offset that puts the anchor item back at the top of the window,
 * for the current layout. When the anchor item is gone, the item that follows
 * it takes its place.
 */
export function restoreScrollTop(
  model: GridModel,
  layout: CardLayout,
  state: ViewState,
): number {
  if (state.anchorKey === null || model.count === 0) return 0;
  const index = model.nearestIndexOfKey(state.anchorKey);
  const offset = Math.min(
    Math.max(0, state.anchorOffset),
    layout.cardHeight - 1,
  );
  return Math.floor(index / layout.cols) * layout.cardHeight + offset;
}

/** The index of the item that was selected, or -1 if it is not in `model`. */
export function restoreSelectedIndex(
  model: GridModel,
  state: ViewState,
): number {
  return state.selectedKey === null ? -1 : model.indexOfKey(state.selectedKey);
}
