import { useState } from "react";
import type { SavedUi } from "../lib/saved-ui.ts";
import type { View } from "../lib/view-mode.ts";

/**
 * Which view the main area shows. It belongs to the app, not to the text view
 * (which only needs to know whether it is the one shown): the grid and the text
 * are two views of the same font, and a third would be one more value here.
 * It starts where the panel was left (see SavedUi.mode). What switching does to
 * the parts (the zoom over the grid closes, the text is made ready) is for the
 * caller, which knows them.
 */
export function useMainView(saved?: SavedUi) {
  const [view, setView] = useState<View>(saved?.mode?.view ?? "grid");
  return { view, setView };
}
