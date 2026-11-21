// Unicode blocks: the named ranges of code points ("CJK Unified Ideographs",
// U+4E00..U+9FFF) that the block dropdown offers.
//
// The data comes from Blocks.txt through scripts/unicode/gen-unicode.ts. This file is
// the hand-written part: lookups and grouping. A block is not a script and not a
// plane: U+4E00 is in Basic Multilingual Plane, block "CJK Unified Ideographs",
// script Han.

import { BLOCK_ROWS } from "./data.generated.ts";

export { UNICODE_VERSION } from "./data.generated.ts";

export interface UnicodeBlock {
  /** First code point of the block. */
  readonly start: number;
  /** Last code point of the block (inclusive). */
  readonly end: number;
  readonly name: string;
  /** 0 for U+0000..U+FFFF, 1 for U+10000..U+1FFFF, and so on. */
  readonly plane: number;
}

/** Ascending by code point, non-overlapping. */
export const unicodeBlocks: readonly UnicodeBlock[] = BLOCK_ROWS.map(
  ([start, end, name]) => ({ start, end, name, plane: start >>> 16 }),
);

/**
 * The index in `blocks` of the block that contains `codepoint`, or -1 when it
 * lies in no block (a few ranges, such as U+E0080..U+E00FF, belong to none).
 */
export function blockIndexOf(
  codepoint: number,
  blocks: readonly UnicodeBlock[] = unicodeBlocks,
): number {
  let low = 0;
  let high = blocks.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const block = blocks[middle];
    if (codepoint < block.start) high = middle - 1;
    else if (codepoint > block.end) low = middle + 1;
    else return middle;
  }
  return -1;
}

const PLANE_NAMES: Readonly<Record<number, string>> = {
  0: "Basic Multilingual Plane",
  1: "Supplementary Multilingual Plane",
  2: "Supplementary Ideographic Plane",
  3: "Tertiary Ideographic Plane",
  14: "Supplementary Special-purpose Plane",
  15: "Supplementary Private Use Area-A",
  16: "Supplementary Private Use Area-B",
};

/** The Unicode name of a plane; unassigned planes are just "Plane N". */
export function planeName(plane: number): string {
  return PLANE_NAMES[plane] ?? `Plane ${plane}`;
}

export interface PlaneGroup {
  readonly plane: number;
  readonly name: string;
  readonly blocks: readonly UnicodeBlock[];
}

/** Split blocks (ascending) into one group per plane that has any, in order. */
export function groupBlocksByPlane(
  blocks: readonly UnicodeBlock[],
): PlaneGroup[] {
  const groups: { plane: number; name: string; blocks: UnicodeBlock[] }[] = [];
  for (const block of blocks) {
    let group = groups.at(-1);
    if (!group || group.plane !== block.plane) {
      group = { plane: block.plane, name: planeName(block.plane), blocks: [] };
      groups.push(group);
    }
    group.blocks.push(block);
  }
  return groups;
}
