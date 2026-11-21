// States, filters and coverage.

import { codepointKind } from "../../src/core/unicode/categories.ts";
import { FONTS } from "../fixtures/fonts.ts";
import {
  BLOCK,
  type Context,
  check,
  inRange,
  N,
  open,
  SHOW,
  skip,
  tally,
  U,
  unmappedDrawn,
} from "./harness.ts";

export async function states({ fonts: { synthesized } }: Context) {
  // ---- states, filters, coverage (a font with plenty of undrawn glyphs) ----
  if (synthesized) {
    const app = await open(FONTS.synthesized);
    const all = tally(synthesized);
    let stats = await app.stats();
    check(
      "Whole font: Drawn and Undrawn match every outline built by opentype.js",
      stats.includes(`Drawn ${N(all.drawn + unmappedDrawn(synthesized))}`) &&
        stats.includes(`Undrawn ${N(all.undrawn)}`),
      `expected ${all.drawn + unmappedDrawn(synthesized)} / ${all.undrawn}`,
    );
    const show = await app.options(SHOW);
    check(
      "Show: Mapped, Drawn, Blank, Undrawn, Missing, Mapped + Missing: one for each state in the line under the toolbar; the last two wait for a block",
      show.map((o) => o.value).join() ===
        "mapped,drawn,blank,undrawn,missing,all" &&
        show
          .filter((o) => o.value === "missing" || o.value === "all")
          .every((o) => o.disabled),
      show.map((o) => o.text).join(" | "),
    );

    await app.pickBlock("CJK Unified Ideographs (");
    const cjk = tally(synthesized, inRange(0x4e00, 0x9fff));
    const mapped = cjk.drawn + cjk.blank + cjk.undrawn;
    const missing = 20992 - mapped;
    stats = await app.stats();
    check(
      "CJK block: Drawn, Undrawn and Missing, with their shares",
      stats.includes(
        `Drawn ${N(cjk.drawn)} ${Math.round((cjk.drawn / 20992) * 100)}%`,
      ) &&
        stats.includes(
          `Undrawn ${N(cjk.undrawn)} ${Math.round((cjk.undrawn / 20992) * 100)}%`,
        ) &&
        stats.includes(
          `Missing ${N(missing)} ${Math.round((missing / 20992) * 100)}%`,
        ),
      stats.slice(stats.indexOf("Drawn")),
    );
    const bar = await app.page.$$eval(".coverage-bar > div", (ds) =>
      ds.map((d) => Number.parseFloat((d as HTMLElement).style.width)),
    );
    const pct = (n: number) => (n / 20992) * 100;
    check(
      "CJK block: the bar is Drawn | Blank | Undrawn and the rest is Missing",
      bar.length === 3 &&
        Math.abs(bar[0] - pct(cjk.drawn)) < 0.01 &&
        Math.abs(bar[2] - pct(cjk.undrawn)) < 0.01 &&
        Math.abs(bar.reduce((a, b) => a + b, 0) + pct(missing) - 100) < 0.01,
      bar.map((w) => w.toFixed(2)).join(" | "),
    );
    const labels = new Map(
      (await app.options(SHOW)).map((o) => [o.value, o.text]),
    );
    check(
      "Show options say how many they show, and the numbers add up",
      labels.get("mapped") === `Mapped (${N(mapped)})` &&
        labels.get("missing") === `Missing (${N(missing)})` &&
        labels.get("all") === `Mapped + Missing (${N(20992)})` &&
        mapped + missing === 20992,
      [...labels.values()].join(" | "),
    );

    const rows = async (count: number) => {
      const { cols, cell } = await app.layout();
      return Math.ceil(count / cols) * cell;
    };
    const cps = [...synthesized.cmap]
      .filter(([cp]) => inRange(0x4e00, 0x9fff)(cp))
      .sort((a, b) => a[0] - b[0]);
    const firstUndrawn = cps.find(
      ([cp, g]) => synthesized.empty(g) && codepointKind(cp) === "ink",
    )?.[0] as number;
    await app.pick(SHOW, "undrawn");
    await app.clickCard(0);
    let panel = await app.inspector();
    check(
      "Undrawn: one card per undrawn glyph, the first is the lowest, the inspector explains it",
      (await app.spacer()) === (await rows(cjk.undrawn)) &&
        panel.includes(U(firstUndrawn)) &&
        panel.includes("Undrawn") &&
        panel.includes(
          "The font has an empty glyph for this character, but it should show ink",
        ),
      U(firstUndrawn),
    );

    await app.pick(SHOW, "drawn");
    await app.clickCard(0);
    check(
      "Drawn: the first card is the lowest drawn code point",
      (await app.inspector()).includes(
        U(cps.find(([, g]) => !synthesized.empty(g))?.[0] as number),
      ),
    );

    const missingCps = [];
    for (let cp = 0x4e00; cp <= 0x9fff; cp++)
      if (!synthesized.cmap.has(cp)) missingCps.push(cp);
    await app.pick(SHOW, "missing");
    await app.clickCard(0);
    panel = await app.inspector();
    check(
      "Missing: only the characters the font lacks; the inspector explains the gap",
      missingCps.length === missing &&
        (await app.spacer()) === (await rows(missing)) &&
        panel.includes(U(missingCps[0])) &&
        /Status\s*Missing/.test(panel) &&
        panel.includes(
          "The font has no glyph for this character, although Unicode defines it",
        ) &&
        panel.includes("Copy code point"),
      U(missingCps[0]),
    );

    await app.pick(SHOW, "all");
    check(
      "Mapped + Missing: one cell per character of the block",
      (await app.spacer()) === (await rows(20992)),
    );
    await app.clickCard(missingCps[0] - 0x4e00);
    check(
      "... and a missing cell opens the gap explanation",
      /Status\s*Missing/.test(await app.inspector()),
    );

    await app.pick(BLOCK, "none");
    check(
      "Unmapped glyphs: the Show filter falls back to Mapped, since there are no characters to miss",
      (await app.value(SHOW)) === "mapped" &&
        (await app.stats()).includes("Unmapped glyphs"),
    );

    // A search that the Show filter hides.
    await app.pickBlock("CJK Unified Ideographs (");
    await app.pick(SHOW, "undrawn");
    await app.search("U+4E00"); // drawn in this font
    check(
      "A match hidden by the Show filter is reported as such",
      (await app.stats()).includes("1 match hidden by the Show filter"),
    );
    await app.search("");
    await app.pick(SHOW, "all");
    await app.search(U(missingCps[0]));
    await app.clickCard(0);
    check(
      "Mapped + Missing: a missing character can be searched, and found as a cell",
      (await app.stats()).includes("1 result") &&
        /Status\s*Missing/.test(await app.inspector()),
    );
    await app.page.close();
  } else
    skip("States, filters and coverage", "the synthesized font is missing");
}
