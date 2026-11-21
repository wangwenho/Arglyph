import { ALL_ITEMS } from "../../core/grid/blocks.ts";
import { FILTER_MAPPED } from "../../core/grid/filters.ts";

/** What the user asked the grid to narrow down to; what the webview keeps. */
export interface BrowseChoice {
  /** The block dropdown's value as asked for (it may not exist in this font). */
  block: string;
  /** The Show dropdown's value as asked for. */
  filter: string;
  /** The text in the search box. */
  search: string;
}

export const DEFAULT_BROWSE: BrowseChoice = {
  block: ALL_ITEMS,
  filter: FILTER_MAPPED,
  search: "",
};
