// Searching the grid.
//
// One input box, and the text decides what it means:
//   - it starts with `U+` or `0x`: code points. Several can follow, separated by
//     spaces or commas, each one a code point or a range: `U+4E00`,
//     `U+4E00-4E2F`, `U+4E00..U+4E2F`, `0x20000`
//   - anything else: characters. Each *code point* of the text is one search
//     term (a character outside the BMP is one term, not two surrogates), and
//     spaces are separators, not terms (U+0020 is searched as `U+20`)
// A bare `4E00` is not a code point: `bad` and `face` are words, and they are
// also hex digits. (The interface offers the `U+` form instead, see
// bareHexHint.)
//
// A query is a few ranges of code points. A model lists code points in ascending
// order, so each range is one contiguous run of its items: two binary searches
// find it. Searching is the same kind of narrowing as choosing a block.

import { codepointLowerBound, windowModel } from "./blocks.ts";
import { subsetModel } from "./filters.ts";
import type { GridModel } from "./model.ts";

const MAX_CODEPOINT = 0x10ffff;

/** First and last code point, both included. */
export type CodepointRange = readonly [first: number, last: number];

export type SearchQuery =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "match"; ranges: readonly CodepointRange[] };

const PREFIXED = /^\s*(?:u\+|0x)/i;
const RANGE_SEPARATOR = /\s*(?:-|\.\.|~)\s*/g;
const TRAILING_SEPARATOR = /(?:\s*(?:-|\.\.|~)\s*)+$/;
const TOKEN = /^(?:u\+|0x)?([0-9a-f]{1,6})(?:-(?:u\+|0x)?([0-9a-f]{1,6}))?$/i;
const BARE_PREFIX = /^(?:u\+|0x)$/i;

/** Sort, and join ranges that overlap or touch. */
function mergeRanges(ranges: CodepointRange[]): CodepointRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [first, last] of sorted) {
    const previous = merged.at(-1);
    if (previous && first <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], last);
    } else {
      merged.push([first, last]);
    }
  }
  return merged;
}

function parseCodepoints(text: string): SearchQuery {
  // "U+4E00 - U+4E2F" is one range; "U+4E00-" is a range still being typed.
  const normalized = text
    .trim()
    .replace(TRAILING_SEPARATOR, "")
    .replace(RANGE_SEPARATOR, "-");
  const ranges: CodepointRange[] = [];
  for (const token of normalized.split(/[\s,;]+/)) {
    // "U+" alone: the user has not typed the digits yet.
    if (token === "" || BARE_PREFIX.test(token)) continue;
    const match = TOKEN.exec(token);
    if (!match) return { kind: "error", message: `Not a code point: ${token}` };
    const first = Number.parseInt(match[1], 16);
    const last = match[2] === undefined ? first : Number.parseInt(match[2], 16);
    if (Math.max(first, last) > MAX_CODEPOINT) {
      return { kind: "error", message: `Beyond U+10FFFF: ${token}` };
    }
    ranges.push([Math.min(first, last), Math.max(first, last)]);
  }
  return ranges.length === 0
    ? { kind: "none" }
    : { kind: "match", ranges: mergeRanges(ranges) };
}

function parseCharacters(text: string): SearchQuery {
  const ranges: CodepointRange[] = [];
  // for...of walks code points, not UTF-16 units.
  for (const character of text) {
    if (/\s/u.test(character)) continue;
    const codepoint = character.codePointAt(0);
    if (codepoint !== undefined) ranges.push([codepoint, codepoint]);
  }
  return ranges.length === 0
    ? { kind: "none" }
    : { kind: "match", ranges: mergeRanges(ranges) };
}

/** What the text typed in the search box asks for. */
export function parseSearch(text: string): SearchQuery {
  if (text.trim() === "") return { kind: "none" };
  return PREFIXED.test(text) ? parseCodepoints(text) : parseCharacters(text);
}

/**
 * The text as a code point, if the user probably meant one: four to six hex
 * digits and nothing else (`4E00`, `20000`). The search treats it as
 * characters, so the interface suggests the `U+` form. Null otherwise.
 */
export function bareHexHint(text: string): string | null {
  const trimmed = text.trim();
  if (!/^[0-9a-f]{4,6}$/i.test(trimmed)) return null;
  if (Number.parseInt(trimmed, 16) > MAX_CODEPOINT) return null;
  return `U+${trimmed.toUpperCase()}`;
}

/**
 * The items of `model` whose code point is in one of `ranges` (merged and
 * ascending, as parseSearch returns them). The model must list code points in
 * ascending order with the glyphs without one last, like every model here.
 * Keys are the model's own keys.
 */
export function searchModel(
  model: GridModel,
  ranges: readonly CodepointRange[],
): GridModel {
  const runs: [number, number][] = [];
  let total = 0;
  for (const [first, last] of ranges) {
    const start = codepointLowerBound(model, first);
    const end = codepointLowerBound(model, last + 1);
    if (end > start) {
      runs.push([start, end]);
      total += end - start;
    }
  }
  if (runs.length === 0) return windowModel(model, 0, 0);
  if (runs.length === 1) return windowModel(model, runs[0][0], runs[0][1]);
  const indices = new Uint32Array(total);
  let next = 0;
  for (const [start, end] of runs) {
    for (let i = start; i < end; i++) indices[next++] = i;
  }
  return subsetModel(model, indices);
}

/**
 * What to tell the user about a search, from how many items it finds at each
 * level of narrowing: `shown` in what the grid shows, `inBlock` in the chosen
 * block before the Show filter, `inFont` in the whole font.
 */
export type SearchOutcome =
  | { kind: "results"; count: number }
  /** Found in the block, but the Show filter hides them. */
  | { kind: "hidden"; count: number }
  /** None here, some in other blocks. */
  | { kind: "elsewhere"; count: number }
  /** Not in the font at all. */
  | { kind: "absent" };

export function describeSearch(counts: {
  shown: number;
  inBlock: number;
  inFont: number;
}): SearchOutcome {
  if (counts.shown > 0) return { kind: "results", count: counts.shown };
  if (counts.inBlock > 0) return { kind: "hidden", count: counts.inBlock };
  if (counts.inFont > 0) return { kind: "elsewhere", count: counts.inFont };
  return { kind: "absent" };
}
