// The layout holds up.

import { FONTS } from "../fixtures/fonts.ts";
import { type Context, check, open, skip } from "./harness.ts";

export async function layout({ fonts: { notoSans } }: Context) {
  // ---- the layout holds up ------------------------------------------------
  if (notoSans) {
    for (const width of [980, 640, 480]) {
      const app = await open(FONTS.notoSans, { width });
      // The extension has no file picker: it is only the dev page's.
      await app.page.addStyleTag({
        content: "input[type=file] { display: none }",
      });
      await app.pickBlock("CJK Unified Ideographs (");
      const m = await app.page.evaluate(() => {
        const box = (q: string) => document.querySelector(q) as Element;
        return {
          grid: box("#grid-viewport").clientHeight,
          toolbar: box(".toolbar").scrollWidth - box(".toolbar").clientWidth,
          stats: box(".stats").scrollWidth - box(".stats").clientWidth,
          selects: [...document.querySelectorAll("select")].map((s) =>
            Math.round(s.getBoundingClientRect().width),
          ),
        };
      });
      check(
        `Layout at ${width}px: the grid has a height, nothing overflows, the dropdowns are usable`,
        m.grid > 100 &&
          m.toolbar <= 0 &&
          m.stats <= 1 &&
          m.selects.every((w) => w >= 80),
        JSON.stringify(m),
      );
      await app.page.close();
    }
  } else skip("Layout", "Noto Sans TC missing");
}
