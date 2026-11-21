import { type RefObject, useEffect } from "react";
import type { View } from "../lib/view-mode.ts";

/** Where a typed character goes: those keys are not shortcuts there. */
const TEXT_FIELDS = "input, textarea, select, [contenteditable]";

/** What a size key asks for: a step bigger or smaller, or the default size. */
export type SizeKey = -1 | 1 | "reset";

/** The size a key asks for, or null when it is not a size key. */
function sizeKey(key: string): SizeKey | null {
  // "+" needs Shift on most keyboards, so the key itself decides, not Shift.
  switch (key) {
    case "+":
    case "=":
      return 1;
    case "-":
    case "_":
      return -1;
    case "0":
      return "reset";
    default:
      return null;
  }
}

/**
 * The keys that work wherever the focus is in the app:
 *   ?           opens the help window (unless the key is being typed somewhere)
 *   Cmd+F       jumps to the search box, where it would open the find of the page
 *               anywhere else (the text view has no search: the key is left alone)
 *   Cmd+G, T    the grid, the text
 *   Cmd+I       shows or hides the inspector
 *   Cmd + - 0   bigger, smaller and default size of the glyphs or of the text
 *               (the zoom view has these keys for itself, see canvas/zoom/interaction.ts)
 *
 * The keys with Cmd that are the app's are stopped here, not only prevented: a
 * Webview forwards every key to VS Code from a listener on its window, so
 * Cmd+= would zoom the whole window and Cmd+T would open VS Code's symbol
 * search as well. This listener is below that one.
 */
export function useGlobalShortcuts({
  onHelp,
  onView,
  onSize,
  onToggleInspector,
  search,
  searchAvailable,
  zoomOpen,
}: {
  onHelp(): void;
  onView(view: View): void;
  onSize(key: SizeKey): void;
  onToggleInspector(): void;
  search: RefObject<HTMLInputElement | null>;
  searchAvailable: boolean;
  /** The zoom view is open: it has the size keys for itself. */
  zoomOpen: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === "?" && !mod) {
        if ((event.target as Element | null)?.closest(TEXT_FIELDS)) return;
        event.preventDefault();
        onHelp();
      } else if (mod && !event.shiftKey && key === "f") {
        if (!searchAvailable) return;
        const input = search.current;
        if (!input) return;
        event.preventDefault();
        input.focus();
        input.select();
      } else if (mod && !event.shiftKey && (key === "g" || key === "t")) {
        event.preventDefault();
        event.stopPropagation();
        onView(key === "g" ? "grid" : "text");
      } else if (mod && !event.shiftKey && key === "i") {
        event.preventDefault();
        event.stopPropagation();
        onToggleInspector();
      } else if (mod && !zoomOpen && sizeKey(event.key) !== null) {
        event.preventDefault();
        event.stopPropagation();
        onSize(sizeKey(event.key) as SizeKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    onHelp,
    onView,
    onSize,
    onToggleInspector,
    search,
    searchAvailable,
    zoomOpen,
  ]);
}
