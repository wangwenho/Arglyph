// End-to-end checks: the real app in headless Chromium, driven like a user.
//
//   pnpm e2e
//
// The unit tests cover the pure logic in src/core. What they cannot see is the
// glue: that the grid shows up at all, that the dropdowns, the stats line, the
// search box and the inspector agree with each other and with the font. So the
// expected numbers here do NOT come from the app's own code paths: they are
// computed from the font file with opentype.js (every outline built, every cmap
// entry read) and then compared with what the page says.
//
// Needs the test fonts of scripts/fixtures/fonts.ts; a check whose font is missing
// is skipped. Like `pnpm bench`, it starts its own Vite server.
//
// This file only runs the sections. The shared half (server, browser, `open`,
// `check`, the selectors, the font readers) is scripts/e2e/harness.ts; each
// feature section is one file in scripts/e2e/ that takes the context below.

import "./use-repo-root.ts";
import { blocks } from "./e2e/blocks.ts";
import { contextMenu } from "./e2e/context-menu.ts";
import { loadFonts, start, stop, summary } from "./e2e/harness.ts";
import { help } from "./e2e/help.ts";
import { interfaceChecks } from "./e2e/interface.ts";
import { layout } from "./e2e/layout.ts";
import { search } from "./e2e/search.ts";
import { states } from "./e2e/states.ts";
import { textView } from "./e2e/text-view.ts";
import { tooltips } from "./e2e/tooltips.ts";
import { webview } from "./e2e/webview.ts";
import { zoom } from "./e2e/zoom.ts";

await start();
const ctx = { fonts: loadFonts() };
try {
  for (const section of [
    layout,
    states,
    blocks,
    interfaceChecks,
    zoom,
    textView,
    search,
    help,
    contextMenu,
    tooltips,
    webview,
  ]) {
    await section(ctx);
  }
} finally {
  await stop();
}
process.exit(summary());
