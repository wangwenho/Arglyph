// Where a glyph is on the screen of the zoom view.
//
// The zoom view draws one glyph big and lets the user move and zoom it. All of
// that is one transform: where the glyph origin (the baseline, x = 0) is on the
// screen, and how many pixels one font unit is. Everything else (the guides,
// the outline, the points to come) is placed with it, so the math lives here
// as plain functions that a test can check.
//
// Font units point down (see GlyphBox), so a point of the glyph is at
// `(x + px * scale, y + py * scale)`.

import {
  computeGlyphBaselineY,
  computeGlyphOriginX,
  type GlyphBox,
} from "../glyph/origin.ts";

export interface ViewTransform {
  /** Pixels per font unit. */
  scale: number;
  /** Screen position of the glyph origin. */
  x: number;
  y: number;
}

/** The part of the shorter side of the view that the em square leaves free on each side. */
const FIT_MARGIN = 0.12;

/** How far the user may zoom out and in, as a multiple of the fitted scale. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 128;

export interface FitInput {
  /** Size of the view, in pixels. */
  width: number;
  height: number;
  unitsPerEm: number;
  /** Height of the em square above the baseline, in font units. */
  ascender: number;
  glyph: GlyphBox;
}

/** The scale at which the em square fills the view, with a margin around it. */
export function fitScale(width: number, height: number, unitsPerEm: number) {
  return (Math.min(width, height) * (1 - 2 * FIT_MARGIN)) / unitsPerEm;
}

/**
 * The transform that shows the whole em square, centered in the view: the same
 * rule the grid uses inside a card, so a glyph sits where it does there.
 */
export function fitTransform({
  width,
  height,
  unitsPerEm,
  ascender,
  glyph,
}: FitInput): ViewTransform {
  const scale = fitScale(width, height, unitsPerEm);
  const squareSize = unitsPerEm * scale;
  const squareX = (width - squareSize) / 2;
  const squareY = (height - squareSize) / 2;
  return {
    scale,
    x: computeGlyphOriginX(squareX, squareSize, scale, glyph),
    y: computeGlyphBaselineY(squareY, ascender * scale),
  };
}

/** `factor` times as big, so that the point (`anchorX`, `anchorY`) of the view stays where it is. */
export function zoomAt(
  transform: ViewTransform,
  anchorX: number,
  anchorY: number,
  factor: number,
  minScale: number,
  maxScale: number,
): ViewTransform {
  const scale = Math.min(
    maxScale,
    Math.max(minScale, transform.scale * factor),
  );
  const ratio = scale / transform.scale;
  return {
    scale,
    x: anchorX - (anchorX - transform.x) * ratio,
    y: anchorY - (anchorY - transform.y) * ratio,
  };
}

export function panBy(
  transform: ViewTransform,
  dx: number,
  dy: number,
): ViewTransform {
  return { scale: transform.scale, x: transform.x + dx, y: transform.y + dy };
}

/**
 * The view got `dw` wider and `dh` taller: keep what is at its center at the
 * center, so resizing a pane does not make the glyph slide out of sight.
 */
export function resizeAround(
  transform: ViewTransform,
  dw: number,
  dh: number,
): ViewTransform {
  return panBy(transform, dw / 2, dh / 2);
}

/** The scales the user may reach, given the scale that fits the view. */
export function zoomLimits(fit: number): { min: number; max: number } {
  return { min: fit * MIN_ZOOM, max: fit * MAX_ZOOM };
}
