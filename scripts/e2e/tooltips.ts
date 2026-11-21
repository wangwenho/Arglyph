// Tooltips.

import { FONTS } from "../fixtures/fonts.ts";
import {
  BLOCK,
  type Context,
  check,
  open,
  SHOW,
  SWITCH,
  skip,
} from "./harness.ts";

export async function tooltips({ fonts: { latin } }: Context) {
  // ---- tooltips ------------------------------------------------------------
  if (latin) {
    const app = await open(FONTS.latin);
    const TIP = ".tooltip";
    const hover = async (selector: string) => {
      await app.page.hover(selector);
      await app.page.waitForTimeout(700);
    };
    const tipText = () => app.page.$eval(TIP, (e) => e.textContent ?? "");
    check(
      "No tooltip until the pointer rests on something",
      (await app.page.$(TIP)) === null,
    );
    await app.page.mouse.move(600, 400);
    await hover('button[aria-label="Keyboard shortcuts and gestures"]');
    check(
      "Resting on the ? button says what it does",
      (await app.page.$(TIP)) !== null &&
        (await tipText()).startsWith("Show keyboard shortcuts and gestures"),
    );
    await app.page.mouse.move(600, 400);
    await app.page.waitForTimeout(100);
    check(
      "... and it goes when the pointer leaves",
      (await app.page.$(TIP)) === null,
    );

    // Each of the toolbar's controls says what it is.
    const wrong = [];
    for (const [selector, words] of [
      [SWITCH("Grid"), "grid"],
      [SWITCH("Text"), "Type text"],
      ['button[aria-label="Toggle inspector"]', "inspector"],
      [BLOCK, "Unicode block"],
      [SHOW, "Show glyphs"],
      [".search-field input", "Search by character"],
      ['button[aria-label="Decrease glyph size"]', "Decrease glyph size"],
    ]) {
      await app.page.mouse.move(600, 400);
      await app.page.waitForTimeout(80);
      await hover(selector);
      const text = (await app.page.$(TIP)) ? await tipText() : "";
      if (!text.includes(words))
        wrong.push(`${selector}: ${JSON.stringify(text.slice(0, 50))}`);
    }
    check(
      "The toolbar's controls each have a tooltip that says what they are",
      wrong.length === 0,
      wrong.join(" | "),
    );

    // Inside the window, whichever side the button is on.
    await app.page.mouse.move(600, 400);
    await hover('button[aria-label="Toggle inspector"]');
    const box = await app.page.$eval(TIP, (e) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top };
    });
    check(
      "A tooltip at the right edge stays inside the window",
      box.left >= 0 && box.right <= 1200 && box.top > 0,
      JSON.stringify(box),
    );

    // The keyboard gets them too, but a click does not leave one behind.
    await app.page.mouse.move(600, 400);
    await app.page.waitForTimeout(100);
    await app.page.focus("#grid-viewport");
    await app.page.keyboard.press("Tab");
    await app.page.waitForTimeout(150);
    const focusedTip = await app.page.evaluate(
      () => document.activeElement?.getAttribute("data-tip") ?? null,
    );
    check(
      "Tabbing to a control with a tooltip shows it at once",
      focusedTip === null || (await app.page.$(TIP)) !== null,
      String(focusedTip),
    );
    await app.page.click(SWITCH("Text"));
    await app.page.waitForTimeout(700);
    check("A click takes the tooltip away", (await app.page.$(TIP)) === null);
    check(
      "The toolbar no longer relies on the browser's own title",
      (await app.page.$$eval(
        ".toolbar [title], .zoom-bar [title]",
        (e) => e.length,
      )) === 0,
    );
    await app.page.close();
  } else skip("Tooltips", "Lato missing");
}
