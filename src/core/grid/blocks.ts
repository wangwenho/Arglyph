// Showing one Unicode block of a font.
//
// A GridModel lists code points in ascending order and puts the glyphs without
// a code point last. So the items of one block are a contiguous run: two binary
// searches find its ends, and a window over the full model shows just that run.
// Nothing is copied, and the window answers in O(1) like the model itself.

import type { UnicodeBlock } from "../unicode/blocks.ts";
import { codepointKind, isExpectedKind } from "../unicode/categories.ts";
import type { GridModel } from "./model.ts";

/** One past the last code point: bigger than any item with a code point. */
const CODE_SPACE_END = 0x110000;

/**
 * The index of the first item whose code point is >= `codepoint`, counting the
 * items without a code point (which come last) as larger than everything.
 * `model.count` when there is none.
 */
export function codepointLowerBound(
  model: GridModel,
  codepoint: number,
): number {
  let low = 0;
  let high = model.count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const value = model.codepointAt(middle);
    if (value >= 0 && value < codepoint) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The items `[start, end)` of `source` as a model of their own. Indices start
 * at 0 again, keys are the source's keys (so a selection can be carried over),
 * and nothing is copied.
 */
export function windowModel(
  source: GridModel,
  start: number,
  end: number,
): GridModel {
  const count = Math.max(0, end - start);
  return {
    count,
    codepointAt: (index) => source.codepointAt(start + index),
    glyphIndexAt: (index) => source.glyphIndexAt(start + index),
    stateAt: (index) => source.stateAt(start + index),
    labelAt: (index) => source.labelAt(start + index),
    keyAt: (index) => source.keyAt(start + index),
    indexOfKey(key) {
      const index = source.indexOfKey(key) - start;
      return index >= 0 && index < count ? index : -1;
    },
    nearestIndexOfKey(key) {
      const index = source.nearestIndexOfKey(key) - start;
      return Math.min(Math.max(index, 0), Math.max(0, count - 1));
    },
  };
}

/** The items of `source` whose code point is in `[first, last]`. */
export function codepointRangeModel(
  source: GridModel,
  first: number,
  last: number,
): GridModel {
  return windowModel(
    source,
    codepointLowerBound(source, first),
    codepointLowerBound(source, last + 1),
  );
}

/** The glyphs that no code point maps to (.notdef, ligatures, alternates). */
export function unmappedModel(source: GridModel): GridModel {
  return windowModel(
    source,
    codepointLowerBound(source, CODE_SPACE_END),
    source.count,
  );
}

export interface BlockCoverage {
  /** Index into the block table that was passed in. */
  readonly blockIndex: number;
  /** How many code points of the block the font maps, of any kind. */
  readonly mapped: number;
  /**
   * How many of those are characters a font is expected to have (not controls,
   * private use or surrogates): the number to set against expectedCount().
   */
  readonly mappedCharacters: number;
}

/**
 * The blocks the font maps at least one code point in, in block order, with how
 * many. This counts what the cmap says; whether the glyphs are actually drawn
 * is another question.
 */
export function summarizeBlocks(
  model: GridModel,
  blocks: readonly UnicodeBlock[],
): BlockCoverage[] {
  const covered: BlockCoverage[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    const first = codepointLowerBound(model, block.start);
    const end = codepointLowerBound(model, block.end + 1);
    if (end <= first) continue;
    let mappedCharacters = 0;
    for (let i = first; i < end; i++) {
      if (isExpectedKind(codepointKind(model.codepointAt(i)))) {
        mappedCharacters++;
      }
    }
    covered.push({ blockIndex, mapped: end - first, mappedCharacters });
  }
  return covered;
}

/** How many items have no code point. */
export function countUnmapped(model: GridModel): number {
  return model.count - codepointLowerBound(model, CODE_SPACE_END);
}

// What the block dropdown holds: one string per option, so it can be the value
// of a <select>.

/** Every item of the font. */
export const ALL_ITEMS = "all";
/** The glyphs without a code point. */
export const NO_CODEPOINT = "none";

/** The option value of `block`: its first code point, in decimal. */
export function blockChoiceValue(block: UnicodeBlock): string {
  return String(block.start);
}

/**
 * The choice to actually use: `choice` if this font still has something under
 * it, otherwise everything. A reload can swap in a font without the block that
 * was chosen.
 */
export function resolveBlockChoice(
  choice: string,
  coverage: readonly BlockCoverage[],
  unmappedCount: number,
  blocks: readonly UnicodeBlock[],
): string {
  if (choice === NO_CODEPOINT) return unmappedCount > 0 ? choice : ALL_ITEMS;
  if (choice === ALL_ITEMS) return choice;
  const found = coverage.some(
    (c) => blockChoiceValue(blocks[c.blockIndex]) === choice,
  );
  return found ? choice : ALL_ITEMS;
}

/** The block a choice names, or null for ALL_ITEMS and NO_CODEPOINT. */
export function blockOfChoice(
  choice: string,
  blocks: readonly UnicodeBlock[],
): UnicodeBlock | null {
  return blocks.find((b) => blockChoiceValue(b) === choice) ?? null;
}

/** The items to show for `choice` (as resolveBlockChoice returns it). */
export function modelForBlockChoice(
  full: GridModel,
  choice: string,
  blocks: readonly UnicodeBlock[],
): GridModel {
  if (choice === NO_CODEPOINT) return unmappedModel(full);
  const block = blockOfChoice(choice, blocks);
  return block ? codepointRangeModel(full, block.start, block.end) : full;
}
