// Blocks and selection.

import { FONTS } from "../fixtures/fonts.ts";
import {
  BLOCK,
  BLOCK_PANEL,
  type Context,
  check,
  inRange,
  load,
  N,
  open,
  skip,
  U,
} from "./harness.ts";

export async function blocks({ fonts: { notoSans, latin } }: Context) {
  // ---- blocks and selection -----------------------------------------------
  if (notoSans) {
    const app = await open(FONTS.notoSans);
    const fullHeight = await app.spacer();
    const blocks = await app.options(BLOCK);
    const cjkCount = [...notoSans.cmap.keys()].filter(
      inRange(0x4e00, 0x9fff),
    ).length;
    check(
      "Blocks: 'All blocks', each block as 'mapped / characters', 'Unmapped glyphs' last",
      blocks[0].text.startsWith("All blocks (") &&
        blocks.at(-1)?.text.startsWith("Unmapped glyphs (") === true &&
        blocks.some(
          (o) => o.text === `CJK Unified Ideographs (${N(cjkCount)} / 20,992)`,
        ),
      blocks.find((o) => o.text.startsWith("CJK Unified Ideographs ("))?.text,
    );
    await app.openBlocks();
    const groups = await app.page.$$eval(`${BLOCK_PANEL} .picker-group`, (g) =>
      g.map((x) => x.dataset.group ?? ""),
    );
    await app.closeBlocks();
    check(
      "Blocks are grouped by plane",
      groups[0].startsWith("Plane 0") &&
        groups.some((g) => g.startsWith("Plane 2")),
      groups.join(" | "),
    );

    // The block panel: a filter box, planes that fold, the keys of a combobox.
    await app.openBlocks();
    const visibleOptions = () =>
      app.page.$$eval(`${BLOCK_PANEL} [role=option]`, (os) =>
        os
          .filter((o) => !(o as HTMLElement).hidden)
          .map((o) => (o as HTMLElement).dataset.label ?? ""),
      );
    const shownBefore = (await visibleOptions()).length;
    const totalOptions = await app.page.$$eval(
      `${BLOCK_PANEL} [role=option]`,
      (os) => os.length,
    );
    check(
      "The block panel opens with the filter box focused and only plane 0 (and the chosen block's plane) unfolded",
      (await app.page.evaluate(
        () => document.activeElement?.className === "picker-search",
      )) && shownBefore < totalOptions,
      `${shownBefore} of ${totalOptions}`,
    );
    // A plane folds shut and open on a click, and its arrow says which it is:
    // pointing down while open, right while shut.
    const plane0 = `${BLOCK_PANEL} .picker-group[data-group^="Plane 0"]`;
    const arrow = () =>
      app.page.$eval(
        `${plane0} .block-chevron`,
        (e) => getComputedStyle(e).transform,
      );
    const expanded = () =>
      app.page.$eval(plane0, (e) => e.getAttribute("aria-expanded"));
    const [openCount, openArrow, openState] = [
      (await visibleOptions()).length,
      await arrow(),
      await expanded(),
    ];
    await app.page.click(plane0);
    await app.page.waitForTimeout(250);
    const [shutCount, shutArrow, shutState] = [
      (await visibleOptions()).length,
      await arrow(),
      await expanded(),
    ];
    await app.page.click(plane0);
    await app.page.waitForTimeout(250);
    check(
      "A click folds a plane shut and opens it again; its arrow points down while open and right while shut",
      openState === "true" &&
        shutState === "false" &&
        openArrow.startsWith("matrix(") &&
        shutArrow === "none" &&
        shutCount < openCount &&
        (await visibleOptions()).length === openCount,
      `${openCount} -> ${shutCount} blocks, ${openArrow} -> ${shutArrow}`,
    );
    await app.page.fill(".picker-search", "cjk");
    await app.page.waitForTimeout(100);
    const found = await visibleOptions();
    check(
      "Typing filters the blocks by name, in whatever plane they are",
      found.length > 1 &&
        found.every((l) => l.toLowerCase().includes("cjk")) &&
        found.some((l) => l.startsWith("CJK Unified Ideographs (")),
      found.join(" | "),
    );
    await app.page.fill(".picker-search", "zzzz");
    await app.page.waitForTimeout(100);
    check(
      "... and says so when nothing matches",
      (await visibleOptions()).length === 0 &&
        (await app.page.isVisible(".picker-none")),
    );
    await app.page.fill(".picker-search", "Basic Latin");
    await app.page.keyboard.press("ArrowDown");
    await app.page.keyboard.press("Enter");
    await app.page.waitForTimeout(350);
    check(
      "Arrow keys and Enter pick a block; the panel closes and the grid has the keys",
      (await app.value(BLOCK)) !== "all" &&
        !(await app.page.$(BLOCK_PANEL)) &&
        (await app.page.evaluate(
          () => document.activeElement?.id === "grid-viewport",
        )),
      await app.value(BLOCK),
    );
    await app.openBlocks();
    await app.page.keyboard.press("Escape");
    check(
      "Escape closes the panel and the focus goes back to the button",
      !(await app.page.$(BLOCK_PANEL)) &&
        (await app.page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ===
            "Unicode block",
        )),
    );
    await app.openBlocks();
    await app.page.mouse.click(600, 500);
    check("A click outside closes it", !(await app.page.$(BLOCK_PANEL)));
    await app.pick(BLOCK, "all");

    await app.page.evaluate(() => {
      document.getElementById("grid-viewport")!.scrollTop = 6000;
    });
    await app.page.waitForTimeout(150);
    await app.clickCard(0); // scrolls to the top row of the card and selects it; then scroll away again
    await app.page.evaluate(() => {
      document.getElementById("grid-viewport")!.scrollTop = 6000;
    });
    await app.pickBlock("CJK Unified Ideographs (");
    const top = await app.page.evaluate(
      () => document.getElementById("grid-viewport")!.scrollTop,
    );
    check(
      "Choosing a block scrolls to the top and clears the selection",
      top === 0 && !(await app.inspector()).includes("Glyph index"),
    );
    await app.clickCard(0);
    const cjkFirst = [...notoSans.cmap.keys()]
      .filter(inRange(0x4e00, 0x9fff))
      .sort((a, b) => a - b);
    check(
      "The first card of a block is its lowest code point",
      (await app.inspector()).includes(U(cjkFirst[0])),
    );
    await app.page.keyboard.press("ArrowRight");
    await app.page.waitForTimeout(200);
    check(
      "Arrow keys move the selection inside the block",
      (await app.inspector()).includes(U(cjkFirst[1])),
    );
    await app.pick(BLOCK, "none");
    await app.clickCard(0);
    check(
      "Unmapped glyphs are cards labelled 'gid N'",
      /Glyph index/.test(await app.inspector()) &&
        /U\+|gid/.test(await app.inspector()),
    );
    await app.pick(BLOCK, "all");
    check(
      "Back to All blocks restores the whole grid",
      (await app.spacer()) === fullHeight,
    );
    await app.pickBlock("CJK Unified Ideographs (");
    if (latin) await load(app.page, FONTS.latin);
    if (latin) {
      check(
        "A font without the chosen block falls back to All blocks",
        (await app.value(BLOCK)) === "all" &&
          !(await app.options(BLOCK)).some((o) =>
            o.text.startsWith("CJK Unified"),
          ),
      );
      const printable = [...latin.cmap.keys()].filter(
        (c) => c >= 0x20 && c < 0x7f,
      ).length;
      check(
        "Controls are not characters: Basic Latin is out of 95, not 128",
        (await app.options(BLOCK)).some(
          (o) => o.text === `Basic Latin (${printable} / 95)`,
        ),
        (await app.options(BLOCK)).find((o) => o.text.startsWith("Basic Latin"))
          ?.text,
      );
    } else skip("Block fallback and Basic Latin", "Lato missing");
    await app.page.close();
  } else skip("Blocks and selection", "Noto Sans TC missing");
}
