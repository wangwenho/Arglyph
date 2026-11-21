// What the checks put on the page's `window`, or what the page puts there for
// them, so that the functions handed to page.evaluate type-check.

interface Window {
  /** The dev page's render overlay (src/dev/perf-stats.ts); `pnpm bench` drives it. */
  autoScroll(seconds: number, pxPerFrame: number): void;
  /** The stats line, each time it changed (bench.ts). */
  __log: string[];
  /** The keys that reached the window (the interface checks). */
  seenKeys: string[];
  /** What the copy buttons wrote to the clipboard (the interface checks). */
  copied: string[];
  /** What VS Code gives a webview; the webview checks install a stand-in. */
  acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): unknown;
  };
}
