import {
  FILTER_BLANK,
  FILTER_DRAWN,
  FILTER_MISSING,
  FILTER_UNDRAWN,
} from "../../core/grid/filters.ts";
import type { SearchOutcome } from "../../core/grid/search.ts";

/** What to tell the user when the grid has nothing to show, and what they can do about it. */
export interface EmptyState {
  title: string;
  detail?: string;
  action?: { kind: "widen-search" | "show-mapped"; label: string };
}

/**
 * A blank grid with the reason written in a small line above it is easy to
 * miss, and "nothing here" is sometimes good news (nothing is undrawn, nothing
 * is missing), so the reason goes in the middle of the grid, with a way out.
 * `outcome` is the result of the search, or null when nothing is searched for.
 */
export function describeEmpty(input: {
  outcome: SearchOutcome | null;
  filter: string;
  /** Another block than "All blocks" is chosen, so the search can be widened. */
  canWiden: boolean;
}): EmptyState {
  const { outcome, filter, canWiden } = input;
  switch (outcome?.kind) {
    case "elsewhere":
      return {
        title: "No match in this block",
        detail: `${outcome.count} ${outcome.count === 1 ? "match" : "matches"} in other blocks`,
        action: canWiden
          ? { kind: "widen-search", label: "Search all blocks" }
          : undefined,
      };
    case "hidden":
      return {
        title: "Hidden by the Show filter",
        detail: `${outcome.count} ${outcome.count === 1 ? "match" : "matches"} in this block`,
        action: { kind: "show-mapped", label: "Show mapped glyphs" },
      };
    case "absent":
      return {
        title: "Not in this font",
        detail: "The font has no glyph for what you searched for.",
      };
  }
  switch (filter) {
    case FILTER_UNDRAWN:
      return {
        title: "Nothing undrawn",
        detail: "No glyph here is waiting to be drawn.",
      };
    case FILTER_BLANK:
      return {
        title: "No blank glyphs",
        detail: "Every glyph here has an outline.",
      };
    case FILTER_MISSING:
      return {
        title: "Nothing missing",
        detail: "The font has every character of this block.",
      };
    case FILTER_DRAWN:
      return {
        title: "No drawn glyphs",
        detail: "No glyph here has an outline.",
      };
    default:
      return { title: "Nothing to show" };
  }
}
