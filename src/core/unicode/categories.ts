// What Unicode says about a code point, as far as a font previewer cares:
// should a font have it, and what should it look like?
//
// The data is UnicodeData.txt (plus Default_Ignorable_Code_Point) reduced to
// runs by scripts/unicode/gen-unicode.ts. The general category is reduced to the three
// kinds the previewer asks about:
//   ink       a font should have it, with an outline: letters, numbers,
//             punctuation, symbols
//   blank     a font should have it, and it should be empty: spaces, format
//             characters, variation selectors, joiners, the Hangul fillers
//   optional  a font need not have it, and Unicode does not say what it looks
//             like: controls, private use, surrogates
// A code point in no run is unassigned. Ink and blank are the "expected"
// characters: the ones a font can be missing.

import {
  ASSIGNED_RUNS,
  KIND_BLANK,
  KIND_INK,
  KIND_OPTIONAL,
} from "./data.generated.ts";

export type CodepointKind = "ink" | "blank" | "optional" | "unassigned";

const KIND_NAMES: Readonly<Record<number, CodepointKind>> = {
  [KIND_INK]: "ink",
  [KIND_BLANK]: "blank",
  [KIND_OPTIONAL]: "optional",
};

/** `expectedBefore[i]`: how many expected code points lie before run i. */
const expectedBefore = new Uint32Array(ASSIGNED_RUNS.length + 1);
for (const [i, [start, end, kind]] of ASSIGNED_RUNS.entries()) {
  const expected = kind === KIND_INK || kind === KIND_BLANK;
  expectedBefore[i + 1] = expectedBefore[i] + (expected ? end - start + 1 : 0);
}

/** Index of the first run that ends at or after `codepoint` (length if none). */
function firstRunEndingAtOrAfter(codepoint: number): number {
  let low = 0;
  let high = ASSIGNED_RUNS.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ASSIGNED_RUNS[middle][1] < codepoint) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** What Unicode says about `codepoint`; anything outside the code space is unassigned. */
export function codepointKind(codepoint: number): CodepointKind {
  const run = ASSIGNED_RUNS[firstRunEndingAtOrAfter(codepoint)];
  if (!run || codepoint < run[0]) return "unassigned";
  return KIND_NAMES[run[2]] ?? "unassigned";
}

/** Whether a font is expected to have a code point of this kind. */
export function isExpectedKind(kind: CodepointKind): boolean {
  return kind === "ink" || kind === "blank";
}

/** How many expected code points lie below `codepoint`. */
function expectedBelow(codepoint: number): number {
  const index = firstRunEndingAtOrAfter(codepoint);
  const run = ASSIGNED_RUNS[index];
  const expected = run && (run[2] === KIND_INK || run[2] === KIND_BLANK);
  const inside = expected && codepoint > run[0] ? codepoint - run[0] : 0;
  return expectedBefore[index] + inside;
}

/**
 * How many code points in `[first, last]` a font is expected to have: assigned
 * ones that are not controls, private use or surrogates.
 */
export function expectedCount(first: number, last: number): number {
  return expectedBelow(last + 1) - expectedBelow(first);
}
