import type { Font } from "opentype.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ViewState } from "../core/grid/view-state.ts";
import { App, type AppPorts } from "./App.tsx";
import type { Notice } from "./components/Toolbar.tsx";

export interface FontSource {
  fileName: string;
  fileSize: number;
  /** The file itself, for the text view (see AppProps.bytes). */
  bytes?: ArrayBuffer;
  /** Which glyphs have no outline (see findEmptyGlyphs); null when unknown. */
  emptyGlyphs?: Uint8Array | null;
}

export interface AppHandle {
  /** Show a font; `restore` puts the view back where it was (see ViewState). */
  showFont(font: Font, source: FontSource, restore?: ViewState): void;
  /**
   * Show a short message in the toolbar: for a few seconds, or, when
   * `persistent`, until `clearNotice` (or another notice) takes its place.
   */
  showNotice(text: string, kind: Notice["kind"], persistent?: boolean): void;
  /** Take the message away, if there is one. */
  clearNotice(): void;
}

/**
 * Render the app into `container` and return a handle to drive it. Both entry
 * points (the dev page and the webview) receive their fonts by their
 * own means, so the app is driven from outside instead of loading them.
 */
export function mountApp(container: HTMLElement, ports: AppPorts): AppHandle {
  const root = createRoot(container);
  let font: Font | null = null;
  let source: FontSource = { fileName: "", fileSize: 0 };
  let restore: ViewState | undefined;
  let notice: Notice | undefined;
  let noticeCount = 0;

  // Every change renders the whole app again with the latest values; React
  // keeps its own state (selection, inspector toggle) between renders.
  function render() {
    root.render(
      <StrictMode>
        <App
          font={font}
          {...source}
          restore={restore}
          notice={notice}
          {...ports}
        />
      </StrictMode>,
    );
  }
  render();

  return {
    showFont(newFont, newSource, newRestore) {
      font = newFont;
      source = newSource;
      restore = newRestore;
      render();
    },
    showNotice(text, kind, persistent = false) {
      notice = { id: ++noticeCount, text, kind, persistent };
      render();
    },
    clearNotice() {
      if (!notice) return;
      notice = undefined;
      render();
    },
  };
}
