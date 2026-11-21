// The numbers behind the coverage bar: the characters of a block split into the
// four states, which together are the whole block. So the bar is one row of
// adjacent segments, not layers inside one another.

import type { StateCounts } from "../glyph/state.ts";
import { clamp } from "../math.ts";

export interface Coverage {
  /** The cells counted: the block's expected characters, plus any other code point the font maps. */
  total: number;
  drawn: number;
  blank: number;
  undrawn: number;
  missing: number;
  /** 0 to 1: each state's share of `total`. They add up to 1 (0 for an empty block). */
  drawnFraction: number;
  blankFraction: number;
  undrawnFraction: number;
  missingFraction: number;
}

/**
 * `counts` are the states of the block's cells (see blockCellsModel): every
 * character the font is expected to have, plus the code points it maps beyond
 * those. Every cell is in exactly one state, so the shares add up to 1 without
 * any clamping.
 */
export function describeCoverage(counts: StateCounts): Coverage {
  const total = counts.drawn + counts.blank + counts.undrawn + counts.missing;
  const share = (n: number) => (total > 0 ? n / total : 0);
  return {
    total,
    drawn: counts.drawn,
    blank: counts.blank,
    undrawn: counts.undrawn,
    missing: counts.missing,
    drawnFraction: share(counts.drawn),
    blankFraction: share(counts.blank),
    undrawnFraction: share(counts.undrawn),
    missingFraction: share(counts.missing),
  };
}

/** `0.734` as "73%". Never "100%" unless it is, never "0%" unless it is. */
export function formatPercent(fraction: number): string {
  if (fraction <= 0) return "0%";
  if (fraction >= 1) return "100%";
  const percent = Math.round(fraction * 100);
  return `${clamp(percent, 1, 99)}%`;
}
