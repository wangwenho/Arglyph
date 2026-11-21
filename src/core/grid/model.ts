// What the grid shows, as a list of items.
//
// One item is one code point: the cmap decides what is in the font, and block
// filters, coverage and search all talk about code points. A glyph that several
// code points map to therefore appears once per code point. Glyphs that no code
// point maps to (.notdef, ligatures, alternates) come last, in glyph order.
//
// The accessors return numbers and strings instead of an object per item: the
// grid calls them for every visible card on every frame.

import { formatGlyphLabel } from "../glyph/label.ts";
import {
  classifyGlyph,
  GLYPH_DRAWN,
  GLYPH_MISSING,
  type GlyphState,
} from "../glyph/state.ts";
import { codepointKind } from "../unicode/categories.ts";

export interface GridModel {
  /** Number of items. */
  readonly count: number;
  /** The code point of item `index`, or -1 when no code point maps to it. */
  codepointAt(index: number): number;
  /**
   * The glyph drawn for item `index`, or -1 when the font has none (a cell of
   * the "show missing" view).
   */
  glyphIndexAt(index: number): number;
  /** Drawn, Blank, Undrawn or Missing (see glyph/state.ts). */
  stateAt(index: number): GlyphState;
  /** The label shown on the card: `U+XXXX`, or `gid N` without a code point. */
  labelAt(index: number): string;
  /**
   * An identity for item `index` that survives the model being rebuilt (the
   * font changed on disk, a filter changed): the code point, or for a glyph
   * without one `-(glyphIndex + 1)`. Unlike an index, it still names the same
   * item in another model.
   */
  keyAt(index: number): number;
  /** The index of the item with `key` in this model, or -1 if it is not here. */
  indexOfKey(key: number): number;
  /**
   * Where `key` is, or would be: the index of the first item at or after it
   * (code points ascending, then glyphs without one by glyph index). Clamped
   * to the last item. Use it when the exact item may have disappeared.
   */
  nearestIndexOfKey(key: number): number;
}

/** First position in `sorted[0..length)` whose value is >= `value`. */
function lowerBound(
  sorted: Uint32Array | Int32Array,
  length: number,
  value: number,
): number {
  let low = 0;
  let high = length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Build the model from a cmap (`code point -> glyph index`, as opentype.js
 * exposes it) and the number of glyphs in the font. Entries that point at a
 * glyph the font does not have are ignored. `emptyGlyphs` says which glyphs
 * have no outline (see findEmptyGlyphs); without it every glyph counts as drawn.
 */
export function buildGridModel(
  glyphIndexMap: Readonly<Record<string, number>>,
  glyphCount: number,
  emptyGlyphs: Uint8Array | null = null,
): GridModel {
  const keys = Object.keys(glyphIndexMap);
  const hasCodepoint = new Uint8Array(glyphCount);
  const unsorted = new Uint32Array(keys.length);
  let mappedCount = 0;
  for (const key of keys) {
    const glyphIndex = glyphIndexMap[key];
    if (!(glyphIndex >= 0 && glyphIndex < glyphCount)) continue;
    unsorted[mappedCount++] = Number(key);
    hasCodepoint[glyphIndex] = 1;
  }
  const codepoints = unsorted.slice(0, mappedCount).sort();
  const mappedGlyphs = new Int32Array(mappedCount);
  for (let i = 0; i < mappedCount; i++) {
    mappedGlyphs[i] = glyphIndexMap[codepoints[i]];
  }

  let unmappedCount = 0;
  for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex++) {
    if (!hasCodepoint[glyphIndex]) unmappedCount++;
  }
  const unmappedGlyphs = new Int32Array(unmappedCount);
  let next = 0;
  for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex++) {
    if (!hasCodepoint[glyphIndex]) unmappedGlyphs[next++] = glyphIndex;
  }

  const count = mappedCount + unmappedCount;
  // Labels are formatted on first use and then kept: no string is allocated
  // for a card that was already drawn.
  const labels = new Array<string | undefined>(count);

  function codepointAt(index: number): number {
    return index < mappedCount ? codepoints[index] : -1;
  }
  function glyphIndexAt(index: number): number {
    return index < mappedCount
      ? mappedGlyphs[index]
      : unmappedGlyphs[index - mappedCount];
  }
  // Position of `key` among the mapped code points (key >= 0) or among the
  // unmapped glyph indices (key < 0), as an index into the model.
  function lowerBoundIndex(key: number): number {
    if (key >= 0) return lowerBound(codepoints, mappedCount, key);
    return mappedCount + lowerBound(unmappedGlyphs, unmappedCount, -key - 1);
  }
  return {
    count,
    codepointAt,
    glyphIndexAt,
    stateAt(index) {
      const glyphIndex = glyphIndexAt(index);
      if (glyphIndex < 0) return GLYPH_MISSING;
      if (!emptyGlyphs?.[glyphIndex]) return GLYPH_DRAWN;
      const codepoint = codepointAt(index);
      return classifyGlyph(
        true,
        codepoint < 0 ? null : codepointKind(codepoint),
      );
    },
    keyAt(index) {
      return index < mappedCount
        ? codepoints[index]
        : -(unmappedGlyphs[index - mappedCount] + 1);
    },
    indexOfKey(key) {
      const index = lowerBoundIndex(key);
      if (index >= count) return -1;
      const found =
        key >= 0
          ? codepointAt(index) === key
          : glyphIndexAt(index) === -key - 1;
      // A lower bound for a code point may land on the first unmapped glyph.
      return found && key >= 0 === index < mappedCount ? index : -1;
    },
    nearestIndexOfKey(key) {
      return Math.min(lowerBoundIndex(key), Math.max(0, count - 1));
    },
    labelAt(index) {
      let label = labels[index];
      if (label === undefined) {
        const codepoint = codepointAt(index);
        label = formatGlyphLabel(
          codepoint < 0 ? undefined : codepoint,
          glyphIndexAt(index),
        );
        labels[index] = label;
      }
      return label;
    },
  };
}
