import {
  GLYPH_BLANK,
  GLYPH_DRAWN,
  GLYPH_MISSING,
  GLYPH_UNDRAWN,
  type GlyphState,
  glyphStateHint,
  glyphStateName,
  type StateCounts,
} from "../../core/glyph/state.ts";
import { type Coverage, formatPercent } from "../../core/grid/coverage.ts";
import {
  FILTER_BLANK,
  FILTER_DRAWN,
  FILTER_MISSING,
  FILTER_UNDRAWN,
} from "../../core/grid/filters.ts";
import type { SearchOutcome, SearchQuery } from "../../core/grid/search.ts";
import { formatCount, plural } from "../lib/format.ts";
import { SWATCH } from "../lib/state-swatch.ts";

/** What the search box asked and what came of it, for the line under the toolbar. */
export interface SearchStatusProps {
  query: SearchQuery;
  /** Null when the query is not a match (nothing typed, or an error). */
  outcome: SearchOutcome | null;
  /** A code point the text may have been meant as, e.g. "U+4E00". */
  hint: string | null;
}

export interface StatsBarProps {
  /** The chosen block's name, "Unmapped glyphs", or "All blocks". */
  title: string;
  /** The states of the chosen block's characters; null when no block is chosen. */
  coverage: Coverage | null;
  /** The states of what is shown, for the whole font and for "Unmapped glyphs". */
  counts: StateCounts;
  /** The font file said which glyphs are empty. */
  outlinesKnown: boolean;
  /** Present while something is typed in the search box. */
  search?: SearchStatusProps | null;
  /** Which glyphs are shown now (a FILTER_* value). */
  filter: string;
  /** A state in the line was pressed: show just those glyphs. */
  onFilter(filter: string): void;
}

/** The Show filter that shows just the glyphs of a state. */
const FILTER_OF: Partial<Record<GlyphState, string>> = {
  [GLYPH_DRAWN]: FILTER_DRAWN,
  [GLYPH_BLANK]: FILTER_BLANK,
  [GLYPH_UNDRAWN]: FILTER_UNDRAWN,
  [GLYPH_MISSING]: FILTER_MISSING,
};

// One state of the line: a swatch (the same color as its part of the bar, so it
// is also the legend), the state's name, how many, and the share.
function Stat({
  state,
  count,
  fraction,
  secondary,
  filter,
  onFilter,
}: {
  state: GlyphState;
  count: number;
  fraction?: number;
  secondary?: boolean;
  filter: string;
  onFilter(filter: string): void;
}) {
  const warn = state === GLYPH_UNDRAWN;
  const target = FILTER_OF[state];
  const className = `stat${secondary ? " stats-secondary" : ""}${warn ? " stats-undrawn" : ""}`;
  // A state with a filter is a button: the line is also the legend, and
  // pressing a color shows what has it.
  const Tag = target ? "button" : "span";
  return (
    <Tag
      className={target ? `${className} stat-button` : className}
      data-tip={
        target
          ? `${glyphStateHint(state)} Click to show only these.`
          : glyphStateHint(state)
      }
      {...(target
        ? {
            type: "button" as const,
            "aria-pressed": filter === target,
            onClick: () => onFilter(target),
          }
        : {})}
    >
      <i className={`swatch ${SWATCH[state]}`} aria-hidden="true" />
      {glyphStateName(state)} {formatCount(count)}
      {fraction !== undefined && (
        <span className="stat-share"> {formatPercent(fraction)}</span>
      )}
    </Tag>
  );
}

// The triangle in the corner of some cells, explained where the colors are. It
// does not count anything: the grid only learns which glyphs are clipped as it
// draws them, and counting the whole font would mean reading every outline.
function ClippedLegend() {
  return (
    <>
      <span className="stats-divider" aria-hidden="true" />
      <span
        className="stat stats-secondary"
        data-tip="A glyph that extends past its em square is cut off by its cell and marked with this triangle; zoom in to see all of it"
      >
        <i className="clip-mark" aria-hidden="true" />
        Clipped
      </span>
    </>
  );
}

// What the search found, in a few words. When it found nothing, the reason
// matters (other blocks have it, the Show filter hides it, the font does not
// have it), not just the zero; the grid's empty state says the same with a
// button, so this line only says it.
function SearchStatus({ query, outcome, hint }: SearchStatusProps) {
  const hintText = hint && (
    <span className="stats-hint">
      Looking for a code point? Type <b>{hint}</b>
    </span>
  );
  if (query.kind === "error") {
    return (
      <>
        <span className="stats-search stats-undrawn">⚠ {query.message}</span>
        {hintText}
      </>
    );
  }
  if (!outcome) return hintText;
  let message: string;
  switch (outcome.kind) {
    case "results":
      message = plural(outcome.count, "result");
      break;
    case "hidden":
      message = `${plural(outcome.count, "match")} hidden by the Show filter`;
      break;
    case "elsewhere":
      message = `No match in this block, ${formatCount(outcome.count)} in other blocks`;
      break;
    default:
      message = "Not in the font";
  }
  return (
    <>
      <span className="stats-search" role="status">
        {message}
      </span>
      {hintText}
    </>
  );
}

// One line under the toolbar. With a block chosen: what share of its characters
// the font draws, leaves blank, has undrawn, or lacks, as numbers and as one bar
// whose parts add up to the whole block. Without one: what the font maps.
export function StatsBar({
  title,
  coverage,
  counts,
  outlinesKnown,
  search,
  filter,
  onFilter,
}: StatsBarProps) {
  if (!coverage) {
    const mapped = counts.drawn + counts.blank + counts.undrawn;
    return (
      <section className="stats" aria-label="Coverage">
        <span className="stats-title">{title}</span>
        <span className="stats-secondary">{formatCount(mapped)} glyphs</span>
        {outlinesKnown && (
          <Stat
            filter={filter}
            onFilter={onFilter}
            state={GLYPH_DRAWN}
            count={counts.drawn}
          />
        )}
        {outlinesKnown && counts.blank > 0 && (
          <Stat
            filter={filter}
            onFilter={onFilter}
            state={GLYPH_BLANK}
            count={counts.blank}
            secondary
          />
        )}
        {outlinesKnown && counts.undrawn > 0 && (
          <Stat
            filter={filter}
            onFilter={onFilter}
            state={GLYPH_UNDRAWN}
            count={counts.undrawn}
          />
        )}
        <ClippedLegend />
        {search && <SearchStatus {...search} />}
      </section>
    );
  }
  const label =
    `${formatCount(coverage.total)} characters: ` +
    `${formatCount(coverage.drawn)} drawn, ${formatCount(coverage.blank)} blank, ` +
    `${formatCount(coverage.undrawn)} undrawn, ${formatCount(coverage.missing)} missing`;
  return (
    <section className="stats" aria-label="Coverage">
      <span className="stats-title">{title}</span>
      <span className="stats-secondary">
        {formatCount(coverage.total)} characters
      </span>
      <Stat
        filter={filter}
        onFilter={onFilter}
        state={GLYPH_DRAWN}
        count={coverage.drawn}
        fraction={coverage.drawnFraction}
      />
      {coverage.blank > 0 && (
        <Stat
          filter={filter}
          onFilter={onFilter}
          state={GLYPH_BLANK}
          count={coverage.blank}
          fraction={coverage.blankFraction}
          secondary
        />
      )}
      {outlinesKnown && coverage.undrawn > 0 && (
        <Stat
          filter={filter}
          onFilter={onFilter}
          state={GLYPH_UNDRAWN}
          count={coverage.undrawn}
          fraction={coverage.undrawnFraction}
        />
      )}
      {coverage.missing > 0 && (
        <Stat
          filter={filter}
          onFilter={onFilter}
          state={GLYPH_MISSING}
          count={coverage.missing}
          fraction={coverage.missingFraction}
        />
      )}
      <ClippedLegend />
      {search && <SearchStatus {...search} />}
      <div className="coverage-bar" role="img" aria-label={label}>
        <div
          className="coverage-bar-drawn"
          style={{ width: `${coverage.drawnFraction * 100}%` }}
        />
        <div
          className="coverage-bar-blank"
          style={{ width: `${coverage.blankFraction * 100}%` }}
        />
        <div
          className="coverage-bar-undrawn"
          style={{ width: `${coverage.undrawnFraction * 100}%` }}
        />
      </div>
    </section>
  );
}

export interface TextStatsBarProps {
  characters: number;
  undrawn: number;
  missing: number;
}

// The same line in the text view: how the typed characters fare in the font,
// in the same words and colors as the coverage of a block.
export function TextStatsBar({
  characters,
  undrawn,
  missing,
}: TextStatsBarProps) {
  return (
    <section className="stats" aria-label="Text">
      <span className="stats-title">Text</span>
      <span className="stats-secondary">{plural(characters, "character")}</span>
      {undrawn > 0 && (
        <Stat
          filter=""
          onFilter={() => {}}
          state={GLYPH_UNDRAWN}
          count={undrawn}
        />
      )}
      {missing > 0 && (
        <Stat
          filter=""
          onFilter={() => {}}
          state={GLYPH_MISSING}
          count={missing}
        />
      )}
      {characters > 0 && undrawn === 0 && missing === 0 && (
        <span className="stats-search">Every character is in the font</span>
      )}
    </section>
  );
}
