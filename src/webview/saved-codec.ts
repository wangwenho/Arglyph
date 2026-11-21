// What the webview keeps with `setState`: where the user was, and the glyph
// size they chose. VS Code gives the state back when a hidden panel is shown
// again (the page is rebuilt then), so everything read from it is checked: it
// may be missing, or saved by an older version in another shape.

import { type BrowseChoice, DEFAULT_BROWSE } from "../app/lib/browse-choice.ts";
import { clampInspectorWidth } from "../app/lib/inspector-width.ts";
import type { SavedUi } from "../app/lib/saved-ui.ts";
import type { ViewMode } from "../app/lib/view-mode.ts";
import {
  FILTER_ALL,
  FILTER_BLANK,
  FILTER_DRAWN,
  FILTER_MAPPED,
  FILTER_MISSING,
  FILTER_UNDRAWN,
} from "../core/grid/filters.ts";
import { MAX_TARGET_SIZE, MIN_TARGET_SIZE } from "../core/grid/layout.ts";
import type { ViewState } from "../core/grid/view-state.ts";
import { clamp } from "../core/math.ts";
import {
  DEFAULT_TEXT_STYLE,
  MAX_TEXT_LENGTH,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  normalizeLetterSpacing,
  normalizeLineHeight,
  type TextStyle,
} from "../core/text/text.ts";
import {
  DEFAULT_LAYERS,
  LAYER_LIST,
  type ZoomLayers,
} from "../core/zoom/layers.ts";

function isKeyOrNull(value: unknown): value is number | null {
  return value === null || Number.isInteger(value);
}

/**
 * Where to put the view back, from whatever `getState()` returned: only when
 * it was saved for the same file and has the right shape. A state saved by an
 * older version (a different shape) is ignored.
 */
export function readSavedView(
  raw: unknown,
  name: string,
): ViewState | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const candidate = raw as Record<string, unknown>;
  if (
    candidate.name !== name ||
    !isKeyOrNull(candidate.anchorKey) ||
    !isKeyOrNull(candidate.selectedKey) ||
    typeof candidate.anchorOffset !== "number" ||
    !Number.isFinite(candidate.anchorOffset)
  ) {
    return undefined;
  }
  return {
    anchorKey: candidate.anchorKey,
    anchorOffset: Math.max(0, candidate.anchorOffset),
    selectedKey: candidate.selectedKey,
  };
}

/**
 * The glyph size saved with the state, kept inside the slider's range. It does
 * not depend on the file: the size is the user's preference for this panel.
 */
export function readSavedGlyphSize(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const size = (raw as Record<string, unknown>).glyphSize;
  if (typeof size !== "number" || !Number.isFinite(size)) return undefined;
  return clamp(Math.round(size), MIN_TARGET_SIZE, MAX_TARGET_SIZE);
}

/**
 * The zoom view's layers saved with the state. A layer that is missing (saved by
 * an older version, before it existed) or is not a boolean keeps its default.
 */
export function readSavedLayers(raw: unknown): ZoomLayers | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const saved = (raw as Record<string, unknown>).layers;
  if (typeof saved !== "object" || saved === null) return undefined;
  const layers = { ...DEFAULT_LAYERS };
  for (const { layer } of LAYER_LIST) {
    const value = (saved as Record<string, unknown>)[layer];
    if (typeof value === "boolean") layers[layer] = value;
  }
  return layers;
}

/** The text typed to try the font, as it was left (never longer than the text view allows). */
export function readSavedText(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const text = (raw as Record<string, unknown>).text;
  return typeof text === "string" ? text.slice(0, MAX_TEXT_LENGTH) : undefined;
}

/** The size of that text, kept inside the slider's range. */
export function readSavedTextSize(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const size = (raw as Record<string, unknown>).textSize;
  if (typeof size !== "number" || !Number.isFinite(size)) return undefined;
  return clamp(Math.round(size), MIN_TEXT_SIZE, MAX_TEXT_SIZE);
}

/**
 * How the text was set (direction, line height, letter spacing). A part that is
 * missing or not what it should be keeps its default; null for the line height
 * is a value of its own (the font's), so it is only taken when it is saved.
 */
export function readSavedTextStyle(raw: unknown): TextStyle | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const saved = (raw as Record<string, unknown>).textStyle;
  if (typeof saved !== "object" || saved === null) return undefined;
  const { orientation, lineHeight, letterSpacing } = saved as Record<
    string,
    unknown
  >;
  return {
    orientation: orientation === "vertical" ? "vertical" : "horizontal",
    lineHeight:
      lineHeight === null
        ? null
        : typeof lineHeight === "number" && Number.isFinite(lineHeight)
          ? normalizeLineHeight(lineHeight)
          : DEFAULT_TEXT_STYLE.lineHeight,
    letterSpacing:
      typeof letterSpacing === "number"
        ? normalizeLetterSpacing(letterSpacing)
        : DEFAULT_TEXT_STYLE.letterSpacing,
  };
}

/**
 * Whether the user left the inspector open or closed; undefined when they never
 * chose, so that the width of the panel decides.
 */
export function readSavedInspectorOpen(raw: unknown): boolean | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const open = (raw as Record<string, unknown>).inspectorOpen;
  return typeof open === "boolean" ? open : undefined;
}

/** The width the inspector was dragged to, kept in the range it may have. */
export function readSavedInspectorWidth(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const width = (raw as Record<string, unknown>).inspectorWidth;
  if (typeof width !== "number" || !Number.isFinite(width)) return undefined;
  // How much room there is is not known yet: the widest the range allows.
  return clampInspectorWidth(width, Number.POSITIVE_INFINITY);
}

/**
 * Which screen the panel was on: the grid or the text, and the zoom view open
 * or not. Anything missing or not what it should be means the grid with nothing
 * open, and the parts that cannot go together are dropped: the zoom view over
 * the grid has no text offset, and over the text it is the offset that counts.
 */
export function readSavedMode(raw: unknown): ViewMode | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { view, zoomOpen, looking } = raw as Record<string, unknown>;
  if (view === "text") {
    return {
      view: "text",
      zoomOpen: false,
      looking:
        Number.isInteger(looking) && (looking as number) >= 0
          ? (looking as number)
          : null,
    };
  }
  return { view: "grid", zoomOpen: zoomOpen === true, looking: null };
}

const FILTERS: readonly string[] = [
  FILTER_MAPPED,
  FILTER_DRAWN,
  FILTER_BLANK,
  FILTER_UNDRAWN,
  FILTER_MISSING,
  FILTER_ALL,
];
/** The longest search kept: what the search box itself could hold is no more. */
const MAX_SEARCH_LENGTH = 200;
const MAX_BLOCK_LENGTH = 100;

/**
 * The block, the Show filter and the search as they were left. A part that is
 * missing or not what it should be is the default for that part (nothing
 * chosen); whether the block still exists in the font is for the grid to say.
 */
export function readSavedBrowse(raw: unknown): BrowseChoice | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { block, filter, search } = raw as Record<string, unknown>;
  return {
    block:
      typeof block === "string" && block.length <= MAX_BLOCK_LENGTH
        ? block
        : DEFAULT_BROWSE.block,
    filter:
      typeof filter === "string" && FILTERS.includes(filter)
        ? filter
        : DEFAULT_BROWSE.filter,
    search:
      typeof search === "string"
        ? search.slice(0, MAX_SEARCH_LENGTH)
        : DEFAULT_BROWSE.search,
  };
}

/** Everything the interface kept, read from whatever `getState()` returned. */
export function readSavedUi(raw: unknown): SavedUi {
  return {
    glyphSize: readSavedGlyphSize(raw),
    layers: readSavedLayers(raw),
    text: readSavedText(raw),
    textSize: readSavedTextSize(raw),
    textStyle: readSavedTextStyle(raw),
    inspectorWidth: readSavedInspectorWidth(raw),
    inspectorOpen: readSavedInspectorOpen(raw),
    mode: readSavedMode(raw),
    browse: readSavedBrowse(raw),
  };
}

/**
 * The interface's part of what `setState` is given, as the readers above find it
 * again: the parts side by side, the view mode and the browse choice spread out.
 */
export function writeSavedUi({
  mode,
  browse,
  ...parts
}: SavedUi): Record<string, unknown> {
  return { ...parts, ...mode, ...browse };
}
