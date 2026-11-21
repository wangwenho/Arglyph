// The four states of a code point in a font. "Mapped in the cmap" and "actually
// drawn" are two different things, and telling them apart is what a font
// developer comes here for. These four words are used everywhere in the
// interface, and always mean exactly this:
//
//   Drawn     the cmap has it and the glyph has an outline
//   Blank     the cmap has it, the outline is empty, and nothing is wrong with
//             that: a space, a format character, a variation selector, or a
//             control or private-use code point (Unicode says nothing about
//             what those look like). Glyphs without any code point are judged
//             Blank too: there is nothing to say what they should look like
//   Undrawn   the cmap has it, the outline is empty, but Unicode says it is a
//             letter, ideograph or symbol that should show ink: a slot reserved
//             for a glyph that was never drawn. Worse than Missing for a reader:
//             the cmap says the font has it, so no other font steps in
//   Missing   a character a font should have (Unicode assigned it, and it is not
//             a control or private use) and the cmap does not have it
//
// Mapped is the one word for several states together: Drawn, Blank and Undrawn.
// The classification follows the Unicode general category and never guesses
// what the font's author meant.

import type { CodepointKind } from "../unicode/categories.ts";

export const GLYPH_DRAWN = 0;
export const GLYPH_BLANK = 1;
export const GLYPH_UNDRAWN = 2;
export const GLYPH_MISSING = 3;

export type GlyphState =
  | typeof GLYPH_DRAWN
  | typeof GLYPH_BLANK
  | typeof GLYPH_UNDRAWN
  | typeof GLYPH_MISSING;

/**
 * The state of a glyph the font has. `kind` is what Unicode says about its
 * code point, or null for a glyph without one.
 */
export function classifyGlyph(
  isEmpty: boolean,
  kind: CodepointKind | null,
): GlyphState {
  if (!isEmpty) return GLYPH_DRAWN;
  return kind === "ink" ? GLYPH_UNDRAWN : GLYPH_BLANK;
}

const STATE_NAMES: Readonly<Record<GlyphState, string>> = {
  [GLYPH_DRAWN]: "Drawn",
  [GLYPH_BLANK]: "Blank",
  [GLYPH_UNDRAWN]: "Undrawn",
  [GLYPH_MISSING]: "Missing",
};

// One sentence for the inspector and the tooltips: what the state means.
const STATE_HINTS: Readonly<Record<GlyphState, string>> = {
  [GLYPH_DRAWN]:
    "The font has a glyph for this character, drawn with an outline.",
  [GLYPH_BLANK]:
    "The font has an empty glyph for this character, as expected for a space, a format, control or private-use character.",
  [GLYPH_UNDRAWN]:
    "The font has an empty glyph for this character, but it should show ink. It is still to be drawn.",
  [GLYPH_MISSING]:
    "The font has no glyph for this character, although Unicode defines it.",
};

export function glyphStateName(state: GlyphState): string {
  return STATE_NAMES[state];
}

export function glyphStateHint(state: GlyphState): string {
  return STATE_HINTS[state];
}

export interface StateCounts {
  drawn: number;
  blank: number;
  undrawn: number;
  missing: number;
}
