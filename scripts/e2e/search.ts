// Search.

import { FONTS } from "../fixtures/fonts.ts";
import {
  BLOCK,
  type Context,
  check,
  inRange,
  N,
  open,
  SEARCH,
  skip,
  U,
} from "./harness.ts";

export async function search({ fonts: { notoSans, notoSerif } }: Context) {
  // ---- search ---------------------------------------------------------------
  if (notoSans) {
    const app = await open(FONTS.notoSans);
    const fullHeight = await app.spacer();
    const sorted = (where: (cp: number) => boolean) =>
      [...notoSans.cmap.keys()].filter(where).sort((a, b) => a - b);
    const has = (...cps: number[]) =>
      cps.filter((c) => notoSans.cmap.has(c)).length;

    await app.search("國");
    await app.clickCard(0);
    check(
      "A character: 1 result, and it is the card",
      (await app.stats()).includes("1 result") &&
        (await app.inspector()).includes("U+570B"),
    );

    const range = sorted(inRange(0x4e00, 0x4e2f));
    await app.search("U+4E00-4E2F");
    await app.clickCard(0);
    check(
      "A range: every code point the font has in it, lowest first",
      (await app.stats()).includes(`${range.length} results`) &&
        (await app.inspector()).includes(U(range[0])),
      `${range.length} expected`,
    );

    await app.search("U+4E00 U+570B U+20000 U+10FFFF");
    check(
      "Several terms",
      (await app.stats()).includes(
        `${has(0x4e00, 0x570b, 0x20000, 0x10ffff)} result`,
      ),
    );
    await app.search("0x570b");
    check("0x works like U+", (await app.stats()).includes("1 result"));
    await app.search("4E00");
    check(
      "A bare hex number is characters, and the page suggests U+4E00",
      (await app.stats()).includes("Looking for a code point? Type U+4E00"),
    );
    await app.search("U+4E0G");
    check(
      "A term it cannot read is named, and the grid is not narrowed",
      (await app.stats()).includes("⚠ Not a code point: U+4E0G") &&
        (await app.spacer()) === fullHeight,
    );
    await app.search("U+10FFFF");
    check(
      "A code point the font lacks: 'Not in the font'",
      (await app.stats()).includes("Not in the font"),
    );

    await app.search("");
    await app.pickBlock("Basic Latin (");
    await app.search("國");
    const emptyText = () =>
      app.page.$eval(".grid-empty", (e) => e.textContent ?? "");
    check(
      "No match in this block, one elsewhere: the stats line says so, and the empty grid says so and offers to widen",
      (await app.stats()).includes(
        "No match in this block, 1 in other blocks",
      ) &&
        (await emptyText()).includes("No match in this block") &&
        (await emptyText()).includes("Search all blocks"),
    );
    await app.page.click(".grid-empty button");
    await app.page.waitForTimeout(350);
    check(
      "'Search all blocks' widens the search and hands the keyboard back to the grid",
      (await app.value(BLOCK)) === "all" &&
        (await app.stats()).includes("1 result") &&
        (await app.page.evaluate(
          () => document.activeElement?.id === "grid-viewport",
        )),
    );

    await app.search("U+4E00-4E2F");
    await app.page.press(SEARCH, "Enter");
    await app.page.waitForTimeout(250);
    check(
      "Enter selects the first result and moves the focus to the grid",
      (await app.inspector()).includes(U(range[0])) &&
        (await app.page.evaluate(
          () => document.activeElement?.id === "grid-viewport",
        )),
    );
    await app.page.keyboard.press("ArrowRight");
    await app.page.waitForTimeout(200);
    check(
      "... so the arrow keys go on to the next result",
      (await app.inspector()).includes(U(range[1])),
    );

    await app.page.focus(SEARCH);
    await app.page.keyboard.press("Escape");
    await app.page.waitForTimeout(250);
    check(
      "Escape clears the box",
      (await app.value(SEARCH)) === "" && (await app.spacer()) === fullHeight,
    );
    await app.page.keyboard.press("Escape");
    check(
      "... and a second Escape gives the focus to the grid",
      await app.page.evaluate(
        () => document.activeElement?.id === "grid-viewport",
      ),
    );

    // An IME: the letters under the underline are not what is searched for.
    const compose = (text: string, final: boolean) =>
      app.page.evaluate(
        ([text, final]) => {
          const input = document.querySelector(
            'input[type="search"]',
          ) as HTMLInputElement;
          const set = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set as (this: HTMLInputElement, value: string) => void;
          if (!final)
            input.dispatchEvent(
              new CompositionEvent("compositionstart", { bubbles: true }),
            );
          set.call(input, text);
          input.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "insertCompositionText",
              isComposing: true,
              data: text,
            }),
          );
          if (final)
            input.dispatchEvent(
              new CompositionEvent("compositionend", {
                bubbles: true,
                data: text,
              }),
            );
        },
        [text, final] as [string, boolean],
      );
    await app.page.focus(SEARCH);
    await compose("guo", false);
    await app.page.waitForTimeout(250);
    check(
      "IME: letters being composed are not searched",
      (await app.spacer()) === fullHeight &&
        !(await app.stats()).includes("result"),
    );
    await compose("國", true);
    await app.page.waitForTimeout(300);
    check(
      "IME: the finished character is",
      (await app.stats()).includes("1 result"),
    );
    await app.page.close();
  } else skip("Search", "Noto Sans TC missing");

  if (notoSerif) {
    const app = await open(FONTS.notoSerif);
    // Three code points outside the BMP that this font has (the first ones of
    // Ext-B): each is one term, not two surrogates.
    const outside = [...notoSerif.cmap.keys()]
      .filter(inRange(0x20000, 0x2a6df))
      .sort((a, b) => a - b)
      .slice(0, 3);
    await app.search(outside.map((c) => String.fromCodePoint(c)).join(""));
    check(
      "Characters outside the BMP stay whole (one term each, not two surrogates)",
      outside.length === 3 && (await app.stats()).includes("3 result"),
      `${outside.length} code points, ${await app.stats()}`,
    );
    await app.search("");
    const ext = [...notoSerif.cmap.keys()].filter(
      inRange(0x20000, 0x2a6df),
    ).length;
    check(
      "A CFF font: Ext-B is listed with the right count",
      (await app.options(BLOCK)).some(
        (o) =>
          o.text === `CJK Unified Ideographs Extension B (${N(ext)} / 42,720)`,
      ),
    );
    await app.page.close();
  } else skip("CFF font", "Noto Serif TC missing");
}
