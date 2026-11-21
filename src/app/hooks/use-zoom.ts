import type { Font } from "opentype.js";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { GlyphGridView } from "../../canvas/grid/view.ts";
import { formatGlyphLabel } from "../../core/glyph/label.ts";
import type { GridModel } from "../../core/grid/model.ts";
import {
  DEFAULT_LAYERS,
  type ZoomLayer,
  type ZoomLayers,
} from "../../core/zoom/layers.ts";
import type { SavedUi } from "../lib/saved-ui.ts";
import { sameViewMode, type View, type ViewMode } from "../lib/view-mode.ts";
import { useSavedState } from "./use-saved-state.ts";
import type { TextView } from "./use-text-view.ts";

/** What the zoom view is showing, and what its buttons do. */
export interface ZoomTarget {
  /** The glyph; -1 when the font has none; null while it is not known yet. */
  glyphIndex: number | null;
  label: string;
  onNavigate(delta: -1 | 1): void;
  onClose(): void;
}

/**
 * The zoom view. Over the grid it covers it, and the grid stays underneath with
 * its scroll position and selection; it shows the selected glyph, so nothing
 * selected means nothing to show: it closes when the grid says so (a block, a
 * filter or a search was chosen). A reload also selects nothing for a moment,
 * until the grid has found the glyph again: then it stays open. Over the text
 * it is on a character of the text, walks the characters of the text, and
 * nothing of the grid changes.
 */
export function useZoom({
  font,
  model,
  fullModel,
  selectedIndex,
  selectionSettled,
  selectInModel,
  grid,
  view,
  textView,
  saved,
  onSavedChange,
}: {
  font: Font | null;
  /** What the grid shows. */
  model: GridModel | null;
  /** The whole font. */
  fullModel: GridModel | null;
  selectedIndex: number;
  selectionSettled: boolean;
  selectInModel(index: number): void;
  grid: RefObject<GlyphGridView | null>;
  /** The view the main area shows (see useMainView). */
  view: View;
  textView: TextView;
  saved?: SavedUi;
  onSavedChange?(patch: SavedUi): void;
}) {
  const [gridZoomOpen, setGridZoomOpen] = useState(
    saved?.mode?.zoomOpen ?? false,
  );
  const [layers, setLayers] = useSavedState(
    "layers",
    DEFAULT_LAYERS,
    saved,
    onSavedChange,
  );

  // The grid reports what is selected; with nothing, there is nothing to zoom on.
  const onSelect = useCallback(
    (index: number) => {
      selectInModel(index);
      if (index < 0) setGridZoomOpen(false);
    },
    [selectInModel],
  );

  // Tell the page which screen this is, so it can bring the panel back to it. The
  // first report is what it started with, which the page already has.
  const { looking } = textView;
  const reported = useRef<ViewMode>({
    view: saved?.mode?.view ?? "grid",
    zoomOpen: saved?.mode?.zoomOpen ?? false,
    looking: saved?.mode?.looking ?? null,
  });
  useEffect(() => {
    const mode: ViewMode = { view, zoomOpen: gridZoomOpen, looking };
    if (sameViewMode(mode, reported.current)) return;
    reported.current = mode;
    onSavedChange?.({ mode });
  }, [view, gridZoomOpen, looking, onSavedChange]);

  const overGrid =
    gridZoomOpen &&
    font !== null &&
    model !== null &&
    (selectedIndex >= 0 || !selectionSettled);
  const overText = fullModel !== null && textView.lookingCodepoint !== null;

  const glyphOf = (codepoint: number) => {
    const index = fullModel ? fullModel.indexOfKey(codepoint) : -1;
    return fullModel && index >= 0 ? fullModel.glyphIndexAt(index) : -1;
  };
  const closeOverGrid = useCallback(() => setGridZoomOpen(false), []);
  const navigateOverGrid = (delta: -1 | 1) => {
    if (!model || selectedIndex < 0) return;
    grid.current?.select(
      Math.min(model.count - 1, Math.max(0, selectedIndex + delta)),
    );
  };

  let target: ZoomTarget | null = null;
  if (overText && textView.lookingCodepoint !== null) {
    target = {
      glyphIndex: glyphOf(textView.lookingCodepoint),
      label: formatGlyphLabel(textView.lookingCodepoint, -1),
      onNavigate: textView.lookNext,
      onClose: textView.stopLooking,
    };
  } else if (overGrid && model) {
    target = {
      glyphIndex: selectedIndex >= 0 ? model.glyphIndexAt(selectedIndex) : null,
      label: selectedIndex >= 0 ? model.labelAt(selectedIndex) : "",
      onNavigate: navigateOverGrid,
      onClose: closeOverGrid,
    };
  }

  const openOverGrid = useCallback(() => setGridZoomOpen(true), []);
  const toggleLayer = useCallback(
    (layer: ZoomLayer) =>
      setLayers((current: ZoomLayers) => ({
        ...current,
        [layer]: !current[layer],
      })),
    [setLayers],
  );

  return {
    /** What the zoom view shows, or null while it is closed. */
    target,
    /** The zoom view covers the grid. */
    overGrid,
    /** The zoom view is open on a character of the text. */
    overText,
    layers,
    toggleLayer,
    /** The grid asks to look closer at its selected item (Space, double-click). */
    openOverGrid,
    /** Leaving the grid for the text closes the zoom over the grid. */
    closeOverGrid,
    onSelect,
  };
}
