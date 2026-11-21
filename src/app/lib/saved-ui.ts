import type { TextStyle } from "../../core/text/text.ts";
import type { ZoomLayers } from "../../core/zoom/layers.ts";
import type { BrowseChoice } from "./browse-choice.ts";
import type { ViewMode } from "./view-mode.ts";

/**
 * What the interface keeps from one visit to the next (the webview saves it
 * with `setState`, see webview/saved-codec.ts). Every part is optional: what was
 * never saved, or no longer makes sense, is left out, and the interface uses its
 * own default for it. The app hands a change over as a patch of the parts that
 * changed.
 */
export interface SavedUi {
  /** The size the user asked the cards to have. */
  glyphSize?: number;
  /** Which layers of the zoom view are on. */
  layers?: ZoomLayers;
  /** The text typed to try the font, its size and how it is set. */
  text?: string;
  textSize?: number;
  textStyle?: TextStyle;
  /** The inspector: how wide it was dragged to, and open or closed by choice. */
  inspectorWidth?: number;
  inspectorOpen?: boolean;
  /** Grid or text, and the zoom view. */
  mode?: ViewMode;
  /** The block, the Show filter and the search. */
  browse?: BrowseChoice;
}
