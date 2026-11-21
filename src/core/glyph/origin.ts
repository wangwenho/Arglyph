// Where a glyph is drawn inside its em square.
//
// These helpers look trivial on purpose: the grid, the guide lines (baseline,
// ascender, advance) and the control-point overlay planned for the zoom view
// must all agree on the same origin. Keeping the rule in one place makes that
// agreement testable.

/**
 * The size of one glyph, in font units. Y points down (screen convention), so
 * ink above the baseline has a negative `inkMinY`.
 */
export interface GlyphBox {
  advance: number;
  inkMinX: number;
  inkMaxX: number;
  inkMinY: number;
  inkMaxY: number;
}

/**
 * The x coordinate of the glyph origin, so the glyph is centered horizontally
 * in the square that starts at `squareX` and is `squareSize` wide.
 *
 * Normally the advance box is centered, which keeps the glyph's side bearings
 * (its position inside the advance) intact. A glyph with a zero advance, such
 * as a combining mark, has no advance box to center, so its ink is centered.
 * `scale` converts font units to pixels.
 */
export function computeGlyphOriginX(
  squareX: number,
  squareSize: number,
  scale: number,
  glyph: GlyphBox,
): number {
  if (glyph.advance > 0) {
    return squareX + (squareSize - glyph.advance * scale) / 2;
  }
  const inkCenter = ((glyph.inkMinX + glyph.inkMaxX) / 2) * scale;
  return squareX + squareSize / 2 - inkCenter;
}

/**
 * The inverse of computeGlyphOriginX: where the em square starts when the glyph
 * origin is at `originX`. The zoom view knows the origin (the user moved it) and
 * needs the square.
 */
export function computeSquareX(
  originX: number,
  squareSize: number,
  scale: number,
  glyph: GlyphBox,
): number {
  if (glyph.advance > 0) {
    return originX - (squareSize - glyph.advance * scale) / 2;
  }
  const inkCenter = ((glyph.inkMinX + glyph.inkMaxX) / 2) * scale;
  return originX + inkCenter - squareSize / 2;
}

/**
 * The y coordinate of the glyph baseline: `ascent` below the square's top edge,
 * so the square is the em square whose top is the typo ascender.
 */
export function computeGlyphBaselineY(squareY: number, ascent: number): number {
  return squareY + ascent;
}
