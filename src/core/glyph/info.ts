// The facts about one grid item that the inspector shows.

import type { GridModel } from "../grid/model.ts";
import { codepointKind } from "../unicode/categories.ts";
import type { GlyphBox } from "./origin.ts";
import { classifyGlyph, type GlyphState } from "./state.ts";

/** The box around the ink, in font units with y pointing up, as font tools show it. */
export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface GlyphInfo {
  /** `U+XXXX`, or `gid N` when no code point maps to the glyph. */
  label: string;
  /** -1 when no code point maps to the glyph. */
  codepoint: number;
  /** The character to copy, or null when there is none to copy. */
  character: string | null;
  glyphIndex: number;
  /** Drawn, Blank or Undrawn, judged from the outline just built (not Missing). */
  state: GlyphState;
  /** Font units. */
  advance: number;
  /** Space between the origin and the ink, in font units; null without ink. */
  leftBearing: number | null;
  /** Space between the ink and the advance edge; null without ink. */
  rightBearing: number | null;
  /** null without ink. */
  boundingBox: BoundingBox | null;
}

/**
 * The character for a code point, or null for values that are not a character
 * on their own: unmapped glyphs (-1), lone surrogates and out-of-range values.
 */
export function codepointToCharacter(codepoint: number): string | null {
  if (!Number.isInteger(codepoint) || codepoint < 0) return null;
  if (codepoint > 0x10ffff) return null;
  if (codepoint >= 0xd800 && codepoint <= 0xdfff) return null;
  return String.fromCodePoint(codepoint);
}

/** Describe item `index` of `model`; `box` is the size of its glyph. */
export function describeGlyph(
  model: GridModel,
  index: number,
  box: GlyphBox,
): GlyphInfo {
  const codepoint = model.codepointAt(index);
  const hasInk = box.inkMaxX > box.inkMinX && box.inkMaxY > box.inkMinY;
  return {
    label: model.labelAt(index),
    codepoint,
    character: codepointToCharacter(codepoint),
    glyphIndex: model.glyphIndexAt(index),
    state: classifyGlyph(
      !hasInk,
      codepoint < 0 ? null : codepointKind(codepoint),
    ),
    advance: box.advance,
    leftBearing: hasInk ? box.inkMinX : null,
    rightBearing: hasInk ? box.advance - box.inkMaxX : null,
    // GlyphBox has y pointing down; font tools (and the font's own tables) up.
    // `0 - y`, not `-y`: for y = 0 the latter is -0, which is not equal to 0.
    boundingBox: hasInk
      ? {
          xMin: box.inkMinX,
          yMin: 0 - box.inkMaxY,
          xMax: box.inkMaxX,
          yMax: 0 - box.inkMinY,
        }
      : null,
  };
}
