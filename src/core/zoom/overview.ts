// The overview in a corner of the zoom view: the whole glyph small, and a
// rectangle for the part the view shows, as an image editor's overview has.
//
// All of it is geometry between three spaces: the glyph's (font units, y down,
// origin at the baseline), the view's (pixels) and the overview's (pixels). It
// lives here as plain functions so a test can check it.

import { computeSquareX, type GlyphBox } from "../glyph/origin.ts";
import type { ViewTransform } from "./view-transform.ts";

/** The largest the overview gets, in pixels. */
export const OVERVIEW_MAX_WIDTH = 132;
export const OVERVIEW_MAX_HEIGHT = 104;
/** Room kept around the glyph in the overview, as a part of its size. */
const PADDING = 0.08;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OverviewInput {
  /** Size of the view, in pixels. */
  width: number;
  height: number;
  transform: ViewTransform;
  unitsPerEm: number;
  /** Height of the em square above the baseline, in font units. */
  ascender: number;
  glyph: GlyphBox;
}

export interface OverviewLayout {
  /** Size of the overview, in pixels. */
  width: number;
  height: number;
  /** Overview pixels per font unit. */
  scale: number;
  /** Where the glyph origin is in the overview. */
  originX: number;
  originY: number;
  /** The part of the glyph the view shows, in overview pixels. */
  viewport: Rect;
  /** The em square and the glyph, in overview pixels. */
  square: Rect;
  /** Something of the glyph is out of view: the overview is of use. */
  needed: boolean;
}

/** What there is to look at, in font units: the em square, the advance box and the ink. */
function contentOf({ unitsPerEm, ascender, glyph }: OverviewInput): Rect {
  const squareLeft = computeSquareX(0, unitsPerEm, 1, glyph);
  const squareTop = -ascender;
  const box = {
    left: Math.min(squareLeft, 0, glyph.inkMinX),
    right: Math.max(squareLeft + unitsPerEm, glyph.advance, glyph.inkMaxX),
    top: Math.min(squareTop, glyph.inkMinY),
    bottom: Math.max(squareTop + unitsPerEm, glyph.inkMaxY),
  };
  return box;
}

/** The part of the glyph's space that the view shows. */
function visibleOf({ width, height, transform }: OverviewInput): Rect {
  return {
    left: -transform.x / transform.scale,
    top: -transform.y / transform.scale,
    right: (width - transform.x) / transform.scale,
    bottom: (height - transform.y) / transform.scale,
  };
}

export function overviewLayout(input: OverviewInput): OverviewLayout {
  const content = contentOf(input);
  const visible = visibleOf(input);
  const contentWidth = content.right - content.left;
  const contentHeight = content.bottom - content.top;
  const padX = contentWidth * PADDING;
  const padY = contentHeight * PADDING;
  const worldWidth = contentWidth + padX * 2;
  const worldHeight = contentHeight + padY * 2;
  const scale = Math.min(
    OVERVIEW_MAX_WIDTH / worldWidth,
    OVERVIEW_MAX_HEIGHT / worldHeight,
  );
  const originX = (padX - content.left) * scale;
  const originY = (padY - content.top) * scale;
  const toOverview = (r: Rect): Rect => ({
    left: originX + r.left * scale,
    top: originY + r.top * scale,
    right: originX + r.right * scale,
    bottom: originY + r.bottom * scale,
  });
  const squareLeft = computeSquareX(0, input.unitsPerEm, 1, input.glyph);
  return {
    width: Math.ceil(worldWidth * scale),
    height: Math.ceil(worldHeight * scale),
    scale,
    originX,
    originY,
    viewport: toOverview(visible),
    square: toOverview({
      left: squareLeft,
      top: -input.ascender,
      right: squareLeft + input.unitsPerEm,
      bottom: -input.ascender + input.unitsPerEm,
    }),
    needed:
      visible.left > content.left ||
      visible.top > content.top ||
      visible.right < content.right ||
      visible.bottom < content.bottom,
  };
}

/**
 * The transform that puts the point of the glyph under (`x`, `y`) of the
 * overview at the center of the view: what a click or a drag in the overview asks for.
 */
export function centerOnOverviewPoint(
  input: OverviewInput,
  layout: OverviewLayout,
  x: number,
  y: number,
): ViewTransform {
  const { scale } = input.transform;
  const glyphX = (x - layout.originX) / layout.scale;
  const glyphY = (y - layout.originY) / layout.scale;
  return {
    scale,
    x: input.width / 2 - glyphX * scale,
    y: input.height / 2 - glyphY * scale,
  };
}
