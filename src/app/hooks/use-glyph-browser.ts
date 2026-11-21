import type { Font } from "opentype.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StateCounts } from "../../core/glyph/state.ts";
import {
  ALL_ITEMS,
  type BlockCoverage,
  blockOfChoice,
  countUnmapped,
  modelForBlockChoice,
  NO_CODEPOINT,
  resolveBlockChoice,
  summarizeBlocks,
} from "../../core/grid/blocks.ts";
import { type Coverage, describeCoverage } from "../../core/grid/coverage.ts";
import {
  blockCellsModel,
  countStates,
  modelForStateFilter,
  resolveStateFilter,
} from "../../core/grid/filters.ts";
import { buildGridModel, type GridModel } from "../../core/grid/model.ts";
import {
  bareHexHint,
  describeSearch,
  parseSearch,
  type SearchOutcome,
  type SearchQuery,
  searchModel,
} from "../../core/grid/search.ts";
import { unicodeBlocks } from "../../core/unicode/blocks.ts";
import { DEFAULT_BROWSE } from "../lib/browse-choice.ts";
import { describeEmpty, type EmptyState } from "../lib/empty-state.ts";
import type { SavedUi } from "../lib/saved-ui.ts";

export interface BrowserOptions {
  /** Where to start (the last time's choice); everything unchosen when not given. */
  saved?: SavedUi;
  /** The choice changed. */
  onSavedChange?(patch: SavedUi): void;
}

export interface GlyphBrowser {
  /** Every glyph of the font; null before a font is shown. */
  fullModel: GridModel | null;
  /** What the grid shows: the block, the filter and the search applied. */
  model: GridModel | null;
  /** Why there is nothing to show, when there is nothing (null otherwise). */
  empty: EmptyState | null;
  /** The font file said which glyphs are empty (see findEmptyGlyphs). */
  outlinesKnown: boolean;
  block: {
    /** The block dropdown's value, as resolveBlockChoice returns it. */
    value: string;
    /** The blocks the font maps something in. */
    coverage: readonly BlockCoverage[];
    unmappedCount: number;
    /** A real block is chosen (not "All blocks" or "Unmapped glyphs"). */
    chosen: boolean;
    select(value: string): void;
  };
  filter: {
    /** The Show dropdown's value, as resolveStateFilter returns it. */
    value: string;
    select(value: string): void;
  };
  /** The states of what the block holds (the whole font when none is chosen). */
  counts: StateCounts;
  /** The summary line: the block's name and, with a block chosen, its coverage. */
  summary: { title: string; coverage: Coverage | null };
  search: {
    text: string;
    setText(text: string): void;
    query: SearchQuery;
    /** Null while nothing valid is searched for. */
    outcome: SearchOutcome | null;
    /** A code point the text may have been meant as. */
    hint: string | null;
    /** Look in every block. */
    widen(): void;
  };
}

const NO_COUNTS: StateCounts = { drawn: 0, blank: 0, undrawn: 0, missing: 0 };

/**
 * What the grid shows is made in steps, each a model over the one before:
 *   the whole font -> the block the dropdown picked (a window over it)
 *   -> the glyphs in the state the Show dropdown picked
 *   -> the ones that match the search
 * A new block, filter or search makes a new model, and the view starts again at
 * the top with nothing selected. All of it is derived during rendering from the
 * font and the three choices, so there is nothing to keep in sync.
 */
export function useGlyphBrowser(
  font: Font | null,
  emptyGlyphs: Uint8Array | null | undefined,
  { saved, onSavedChange }: BrowserOptions = {},
): GlyphBrowser {
  const fullModel = useMemo(
    () =>
      font
        ? buildGridModel(
            font.tables.cmap?.glyphIndexMap ?? {},
            font.glyphs.length,
            emptyGlyphs ?? null,
          )
        : null,
    [font, emptyGlyphs],
  );
  const blocks = useMemo(
    () => (fullModel ? summarizeBlocks(fullModel, unicodeBlocks) : []),
    [fullModel],
  );
  const unmappedCount = useMemo(
    () => (fullModel ? countUnmapped(fullModel) : 0),
    [fullModel],
  );

  // What was asked for may not exist in this font (a reload can swap in one
  // without the chosen block), so the value actually used is resolved from it.
  const initial = saved?.browse ?? DEFAULT_BROWSE;
  const [requestedBlock, setRequestedBlock] = useState(initial.block);
  const blockValue = resolveBlockChoice(
    requestedBlock,
    blocks,
    unmappedCount,
    unicodeBlocks,
  );
  const block = blockOfChoice(blockValue, unicodeBlocks);
  const inBlock = useMemo(
    () =>
      fullModel
        ? modelForBlockChoice(fullModel, blockValue, unicodeBlocks)
        : null,
    [fullModel, blockValue],
  );
  // The chosen block's characters, the font's and the ones it lacks: the
  // summary's numbers come from it, and so do the Missing and Mapped + Missing
  // views.
  const cells = useMemo(
    () => (fullModel && block ? blockCellsModel(fullModel, block) : null),
    [fullModel, block],
  );
  const counts = useMemo(
    () => (inBlock ? countStates(cells ?? inBlock) : NO_COUNTS),
    [cells, inBlock],
  );

  const [requestedFilter, setRequestedFilter] = useState(initial.filter);
  const filterValue = resolveStateFilter(requestedFilter, block !== null);
  const filtered = useMemo(
    () => (inBlock ? modelForStateFilter(inBlock, cells, filterValue) : null),
    [inBlock, cells, filterValue],
  );

  const [searchText, setSearchText] = useState(initial.search);
  const query = useMemo(() => parseSearch(searchText), [searchText]);
  const ranges = query.kind === "match" ? query.ranges : null;
  const model = useMemo(
    () => (filtered && ranges ? searchModel(filtered, ranges) : filtered),
    [filtered, ranges],
  );
  // How many the search finds at each level is what tells a user who found
  // nothing why: other blocks have it, the Show filter hides it, or the font
  // does not have it.
  const outcome = useMemo(
    () =>
      ranges && fullModel && inBlock && model
        ? describeSearch({
            shown: model.count,
            inBlock: searchModel(inBlock, ranges).count,
            inFont: searchModel(fullModel, ranges).count,
          })
        : null,
    [ranges, fullModel, inBlock, model],
  );

  // Tell the page what was chosen, so a rebuilt panel can start from it. The
  // first report would be what it started with, which the page already has.
  const reported = useRef(initial);
  useEffect(() => {
    const last = reported.current;
    if (
      last.block === requestedBlock &&
      last.filter === requestedFilter &&
      last.search === searchText
    ) {
      return;
    }
    reported.current = {
      block: requestedBlock,
      filter: requestedFilter,
      search: searchText,
    };
    onSavedChange?.({ browse: reported.current });
  }, [requestedBlock, requestedFilter, searchText, onSavedChange]);

  const empty = useMemo(
    () =>
      model && model.count === 0
        ? describeEmpty({
            outcome,
            filter: filterValue,
            canWiden: blockValue !== ALL_ITEMS,
          })
        : null,
    [model, outcome, filterValue, blockValue],
  );

  return {
    fullModel,
    model,
    empty,
    outlinesKnown: emptyGlyphs != null,
    block: {
      value: blockValue,
      coverage: blocks,
      unmappedCount,
      chosen: block !== null,
      select: setRequestedBlock,
    },
    filter: { value: filterValue, select: setRequestedFilter },
    counts,
    summary: {
      title: block
        ? block.name
        : blockValue === NO_CODEPOINT
          ? "Unmapped glyphs"
          : "All blocks",
      coverage: block ? describeCoverage(counts) : null,
    },
    search: {
      text: searchText,
      setText: setSearchText,
      query,
      outcome,
      hint: bareHexHint(searchText),
      widen: () => setRequestedBlock(ALL_ITEMS),
    },
  };
}
