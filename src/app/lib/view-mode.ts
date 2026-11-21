/** What the main area shows: the grid of glyphs, or text typed in the font. */
export type View = "grid" | "text";

/**
 * What the main area shows, apart from where in the font it is: the grid or the
 * text, and whether the zoom view is open (over the grid, or over a character
 * of the text). The Webview saves it, so a panel that was hidden and shown again
 * comes back to the same screen.
 */
export interface ViewMode {
  view: View;
  /** The zoom view is open over the grid (always false in the text view). */
  zoomOpen: boolean;
  /** Where in the text the zoom view is open (null in the grid and when closed). */
  looking: number | null;
}

export function sameViewMode(a: ViewMode, b: ViewMode): boolean {
  return (
    a.view === b.view && a.zoomOpen === b.zoomOpen && a.looking === b.looking
  );
}
