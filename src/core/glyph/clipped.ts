// Does a glyph stick out of its em square?
//
// The grid clips every glyph to its square, so a glyph that sticks out is silently
// cut off. The grid painter uses this check to mark such a card, and the stats
// line explains the mark.

import type { GlyphBox } from "./origin.ts";

/** Ink may go this far past the square before it counts as clipped (px). */
const CLIPPED_TOLERANCE = 0.5;

/**
 * True when the glyph's ink reaches outside the square that starts at
 * (`squareX`, `squareY`) and is `squareSize` wide and tall.
 * `originX` and `baselineY` are where the glyph is drawn; `scale` converts
 * font units to pixels. Glyphs without ink (spaces) are never clipped.
 */
export function isGlyphClipped(
  glyph: GlyphBox,
  scale: number,
  originX: number,
  baselineY: number,
  squareX: number,
  squareY: number,
  squareSize: number,
): boolean {
  if (glyph.inkMaxX <= glyph.inkMinX || glyph.inkMaxY <= glyph.inkMinY) {
    return false;
  }
  const left = originX + glyph.inkMinX * scale;
  const right = originX + glyph.inkMaxX * scale;
  const top = baselineY + glyph.inkMinY * scale;
  const bottom = baselineY + glyph.inkMaxY * scale;
  return (
    left < squareX - CLIPPED_TOLERANCE ||
    right > squareX + squareSize + CLIPPED_TOLERANCE ||
    top < squareY - CLIPPED_TOLERANCE ||
    bottom > squareY + squareSize + CLIPPED_TOLERANCE
  );
}
