// The help window.

import { FONTS } from "../fixtures/fonts.ts";
import {
  type Context,
  check,
  open,
  SEARCH,
  SWITCH,
  skip,
  TEXT,
  typeText,
} from "./harness.ts";

export async function help({ fonts: { latin } }: Context) {
  // ---- the help window -----------------------------------------------------
  if (latin) {
    const app = await open(FONTS.latin);
    const HELP = "dialog.help";
    const HELP_BUTTON = 'button[aria-label="Keyboard shortcuts and gestures"]';
    const groups = () =>
      app.page.$$eval(`${HELP} h3`, (hs) => hs.map((h) => h.textContent ?? ""));
    check("No help window until asked for", (await app.page.$(HELP)) === null);

    await app.page.focus("#grid-viewport");
    await app.page.keyboard.press("?");
    await app.page.waitForSelector(HELP);
    const grid = await groups();
    check(
      "? opens the help, the grid's keys first and marked as the current view",
      grid[0].startsWith("Grid") &&
        grid[0].includes("Current view") &&
        grid.some((g) => g.startsWith("Zoom")) &&
        grid.some((g) => g.startsWith("Text")) &&
        grid.some((g) => g.startsWith("Search")),
      grid.join(" | "),
    );
    check(
      "It is a modal dialog: the page behind cannot be reached",
      await app.page.$eval(
        HELP,
        (d) => (d as HTMLDialogElement).open && d.matches(":modal"),
      ),
    );
    const text = await app.page.$eval(HELP, (d) => d.textContent ?? "");
    check(
      "It names the keys: Space, double-click, F O P L S M B R G for the layers, and the search syntax",
      ["Space", "Double-click", "U+0041-U+005A"].every((t) =>
        text.includes(t),
      ) &&
        ["F", "O", "P", "L", "S", "M", "B", "R", "G"].every((k) =>
          text.includes(k),
        ),
    );
    await app.page.keyboard.press("Escape");
    await app.page.waitForTimeout(150);
    check(
      "Esc closes it and the keys are the grid's again",
      (await app.page.$(HELP)) === null &&
        (await app.page.evaluate(() => document.activeElement?.id)) ===
          "grid-viewport",
    );

    await app.page.click(HELP_BUTTON);
    await app.page.waitForSelector(HELP);
    await app.page.keyboard.press("?");
    await app.page.waitForTimeout(150);
    check(
      "The toolbar button opens it, and ? closes it again",
      (await app.page.$(HELP)) === null,
    );

    await app.page.click(".hint-link");
    await app.page.waitForSelector(HELP);
    await app.page.click(`${HELP} button[aria-label="Close"]`);
    await app.page.waitForTimeout(150);
    check(
      "The link in the inspector opens it, and its close button closes it",
      (await app.page.$(HELP)) === null,
    );

    // A click outside the window (on the backdrop) closes it too.
    await app.page.click(HELP_BUTTON);
    await app.page.waitForSelector(HELP);
    await app.page.mouse.click(2, 2);
    await app.page.waitForTimeout(150);
    check(
      "A click on the backdrop closes it",
      (await app.page.$(HELP)) === null,
    );

    // A ? that is typed is a character, not the help.
    await app.page.fill(SEARCH, "");
    await app.page.focus(SEARCH);
    await app.page.keyboard.type("?");
    check(
      "A ? typed in the search box stays in the box",
      (await app.page.$(HELP)) === null && (await app.value(SEARCH)) === "?",
    );
    await app.page.fill(SEARCH, "");

    await app.page.click(SWITCH("Text"));
    await app.page.waitForSelector(".text-view");
    await typeText(app, "abc");
    await app.page.focus(TEXT);
    await app.page.keyboard.press("ControlOrMeta+End");
    await app.page.keyboard.type("?");
    await app.page.waitForTimeout(250);
    check(
      "... and so is one typed in the text",
      (await app.page.$(HELP)) === null &&
        (await app.value(TEXT)).endsWith("?"),
      `${(await app.value(TEXT)).slice(-6)} | help: ${(await app.page.$(HELP)) !== null}`,
    );
    await app.page.click(HELP_BUTTON);
    await app.page.waitForSelector(HELP);
    const textGroups = await groups();
    check(
      "In the text view the help starts with the text's keys",
      textGroups[0].startsWith("Text") &&
        textGroups[0].includes("Current view"),
      textGroups.join(" | "),
    );
    await app.page.keyboard.press("Escape");
    await app.page.waitForTimeout(150);
    await app.page.close();
  } else skip("Help window", "Lato missing");
}
