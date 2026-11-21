// Narrowing what the grid shows by the state of its glyphs, and the cells of a
// block that include the characters a font lacks.
//
// Both build on GridModel, so the grid draws them like any other model:
//   - a state filter keeps some items of a model (a block, or the whole font):
//     a list of the indices to keep, no copy of the items
//   - the cells of a block are a different list altogether: every character of
//     the block that the font has or should have, so the cells without a glyph
//     show up between the others

import { formatGlyphLabel } from "../glyph/label.ts";
import {
  GLYPH_BLANK,
  GLYPH_DRAWN,
  GLYPH_MISSING,
  GLYPH_UNDRAWN,
  type GlyphState,
  type StateCounts,
} from "../glyph/state.ts";
import type { UnicodeBlock } from "../unicode/blocks.ts";
import { codepointKind, isExpectedKind } from "../unicode/categories.ts";
import { codepointLowerBound } from "./blocks.ts";
import type { GridModel } from "./model.ts";

/** First position in `sorted[0..sorted.length)` whose value is >= `value`. */
function lowerBound(sorted: ArrayLike<number>, value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** How many items of `model` are in each state. */
export function countStates(model: GridModel): StateCounts {
  const counts: StateCounts = { drawn: 0, blank: 0, undrawn: 0, missing: 0 };
  for (let i = 0; i < model.count; i++) {
    switch (model.stateAt(i)) {
      case GLYPH_DRAWN:
        counts.drawn++;
        break;
      case GLYPH_BLANK:
        counts.blank++;
        break;
      case GLYPH_UNDRAWN:
        counts.undrawn++;
        break;
      default:
        counts.missing++;
    }
  }
  return counts;
}

/**
 * The items of `source` listed in `indices` (ascending indices into `source`),
 * as a model of its own. Keys are the source's keys.
 */
export function subsetModel(
  source: GridModel,
  indices: Uint32Array,
): GridModel {
  const count = indices.length;
  return {
    count,
    codepointAt: (i) => source.codepointAt(indices[i]),
    glyphIndexAt: (i) => source.glyphIndexAt(indices[i]),
    stateAt: (i) => source.stateAt(indices[i]),
    labelAt: (i) => source.labelAt(indices[i]),
    keyAt: (i) => source.keyAt(indices[i]),
    indexOfKey(key) {
      const sourceIndex = source.indexOfKey(key);
      if (sourceIndex < 0) return -1;
      const position = lowerBound(indices, sourceIndex);
      return indices[position] === sourceIndex ? position : -1;
    },
    nearestIndexOfKey(key) {
      const position = lowerBound(indices, source.nearestIndexOfKey(key));
      return Math.min(position, Math.max(0, count - 1));
    },
  };
}

/** The items of `source` whose state is one of `states`. */
export function modelWithStates(
  source: GridModel,
  states: readonly GlyphState[],
): GridModel {
  const kept = new Uint32Array(source.count);
  let count = 0;
  for (let i = 0; i < source.count; i++) {
    if (states.includes(source.stateAt(i))) kept[count++] = i;
  }
  return subsetModel(source, kept.subarray(0, count));
}

/**
 * Every code point of `block` that `full` has or that a font is expected to have
 * (assigned, and not a control, private use or a surrogate), in order. The ones
 * `full` has show its glyph; the others are Missing (glyph −1). Code points that
 * are neither mapped nor expected are left out.
 */
export function blockCellsModel(
  full: GridModel,
  block: UnicodeBlock,
): GridModel {
  const first = codepointLowerBound(full, block.start);
  const last = codepointLowerBound(full, block.end + 1);
  const codepoints = new Uint32Array(block.end - block.start + 1);
  // For each cell, the index of its item in `full`, or -1.
  const fullIndex = new Int32Array(codepoints.length);
  let count = 0;
  let next = first;
  for (let cp = block.start; cp <= block.end; cp++) {
    const inFont = next < last && full.codepointAt(next) === cp;
    if (inFont || isExpectedKind(codepointKind(cp))) {
      codepoints[count] = cp;
      fullIndex[count] = inFont ? next : -1;
      count++;
    }
    if (inFont) next++;
  }
  const cells = codepoints.subarray(0, count);
  return {
    count,
    codepointAt: (i) => cells[i],
    glyphIndexAt: (i) =>
      fullIndex[i] < 0 ? -1 : full.glyphIndexAt(fullIndex[i]),
    stateAt: (i) =>
      fullIndex[i] < 0 ? GLYPH_MISSING : full.stateAt(fullIndex[i]),
    labelAt: (i) => formatGlyphLabel(cells[i], -1),
    keyAt: (i) => cells[i],
    indexOfKey(key) {
      if (key < 0) return -1;
      const position = lowerBound(cells, key);
      return cells[position] === key ? position : -1;
    },
    nearestIndexOfKey(key) {
      // A key of a glyph without a code point sorts after every code point.
      const position = key < 0 ? count : lowerBound(cells, key);
      return Math.min(position, Math.max(0, count - 1));
    },
  };
}

// What the "show" dropdown holds: which of the glyphs to show.

/** Everything the font maps: Drawn, Blank and Undrawn (the default). */
export const FILTER_MAPPED = "mapped";
export const FILTER_DRAWN = "drawn";
export const FILTER_BLANK = "blank";
export const FILTER_UNDRAWN = "undrawn";
/** Only the characters the font lacks (one block only). */
export const FILTER_MISSING = "missing";
/** Every character of the block, the mapped and the missing together (one block only). */
export const FILTER_ALL = "all";

/**
 * The filter to actually use. "Missing" and "all" are about the characters of
 * a block (what would the missing ones of the whole of Unicode be?), so without
 * a chosen block they are "mapped".
 */
export function resolveStateFilter(
  filter: string,
  blockChosen: boolean,
): string {
  if (filter === FILTER_MISSING || filter === FILTER_ALL) {
    return blockChosen ? filter : FILTER_MAPPED;
  }
  if (
    filter === FILTER_DRAWN ||
    filter === FILTER_BLANK ||
    filter === FILTER_UNDRAWN
  ) {
    return filter;
  }
  return FILTER_MAPPED;
}

/**
 * The items to show. `shown` is what the block choice narrowed the font to;
 * `cells` is that block with its missing characters (blockCellsModel), or null
 * when no block is chosen. `filter` must come from resolveStateFilter.
 */
export function modelForStateFilter(
  shown: GridModel,
  cells: GridModel | null,
  filter: string,
): GridModel {
  switch (filter) {
    case FILTER_DRAWN:
      return modelWithStates(shown, [GLYPH_DRAWN]);
    case FILTER_BLANK:
      return modelWithStates(shown, [GLYPH_BLANK]);
    case FILTER_UNDRAWN:
      return modelWithStates(shown, [GLYPH_UNDRAWN]);
    case FILTER_MISSING:
      return cells ? modelWithStates(cells, [GLYPH_MISSING]) : shown;
    case FILTER_ALL:
      return cells ?? shown;
    default:
      return shown;
  }
}
