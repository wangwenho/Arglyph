import {
  GLYPH_BLANK,
  GLYPH_DRAWN,
  GLYPH_MISSING,
  GLYPH_UNDRAWN,
  type GlyphState,
} from "../../core/glyph/state.ts";

/**
 * The CSS class of the color swatch of a state. The stats line, the coverage bar
 * and the inspector all show a state in the same color (styles/tokens.css), so the
 * stats line is also the legend of the grid.
 */
export const SWATCH: Readonly<Record<GlyphState, string>> = {
  [GLYPH_DRAWN]: "swatch-drawn",
  [GLYPH_BLANK]: "swatch-blank",
  [GLYPH_UNDRAWN]: "swatch-undrawn",
  [GLYPH_MISSING]: "swatch-missing",
};
