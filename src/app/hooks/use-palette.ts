import { useSyncExternalStore } from "react";
import {
  getPalette,
  type Palette,
  subscribePalette,
} from "../../canvas/theme.ts";

/** The glyph colors for the current theme; updates when the theme changes. */
export function usePalette(): Palette {
  return useSyncExternalStore(subscribePalette, getPalette);
}
