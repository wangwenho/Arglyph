// The interface itself.

import { FONTS } from "../fixtures/fonts.ts";
import {
  type App,
  type Context,
  check,
  open,
  SHOW,
  SWITCH,
  skip,
  TEXT,
} from "./harness.ts";

// Cmd/Ctrl+G and T switch the view; Cmd/Ctrl with + - 0 change the size of what
// is shown (the zoom view has those keys for itself, see zoom.ts). VS Code's
// Webview forwards the keys that reach a listener on the window, so none of
// them may get that far.
async function viewAndSizeKeys(app: App) {
  const GLYPH_SIZE = 'input[aria-label="Glyph size"]';
  const FONT_SIZE = 'input[aria-label="Font size"][type=number]';
  const number = (selector: string) =>
    app.page.$eval(selector, (e) =>
      Number.parseFloat((e as HTMLInputElement).value),
    );
  const pressed = (name: string) =>
    app.page.$eval(SWITCH(name), (b) => b.getAttribute("aria-pressed"));
  await app.page.evaluate(() => {
    window.seenKeys = [];
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Meta" && e.key !== "Control") window.seenKeys.push(e.key);
    });
  });

  await app.page.focus("#grid-viewport");
  const start = await number(GLYPH_SIZE);
  await app.page.keyboard.press("ControlOrMeta+=");
  await app.page.waitForTimeout(200);
  const bigger = await number(GLYPH_SIZE);
  await app.page.keyboard.press("ControlOrMeta+-");
  await app.page.keyboard.press("ControlOrMeta+-");
  await app.page.waitForTimeout(200);
  const smaller = await number(GLYPH_SIZE);
  check(
    "Cmd/Ctrl+= and Cmd/Ctrl+- make the glyphs bigger and smaller in the grid",
    bigger > start && smaller < start,
    `${smaller} < ${start} < ${bigger}`,
  );
  await app.page.keyboard.press("ControlOrMeta+0");
  await app.page.waitForTimeout(200);
  check(
    "Cmd/Ctrl+0 goes back to the default glyph size (the grid fits whole columns, so it may be a pixel or two off)",
    Math.abs((await number(GLYPH_SIZE)) - 72) <= 8,
    String(await number(GLYPH_SIZE)),
  );

  await app.page.keyboard.press("ControlOrMeta+t");
  await app.page.waitForSelector(TEXT);
  check(
    "Cmd/Ctrl+T shows the text, with the caret in the box",
    (await pressed("Text")) === "true" &&
      (await app.page.evaluate(
        () => document.activeElement?.tagName === "TEXTAREA",
      )),
  );
  const textStart = await number(FONT_SIZE);
  await app.page.keyboard.press("ControlOrMeta+=");
  await app.page.waitForTimeout(100);
  const textBigger = await number(FONT_SIZE);
  await app.page.keyboard.press("ControlOrMeta+-");
  await app.page.keyboard.press("ControlOrMeta+-");
  await app.page.waitForTimeout(100);
  const textSmaller = await number(FONT_SIZE);
  check(
    "Cmd/Ctrl+= and Cmd/Ctrl+- make the text bigger and smaller, typing in the box",
    textBigger === textStart + 4 && textSmaller === textStart - 4,
    `${textSmaller}, ${textStart}, ${textBigger}`,
  );
  await app.page.keyboard.press("ControlOrMeta+0");
  await app.page.waitForTimeout(100);
  check(
    "Cmd/Ctrl+0 goes back to the default text size",
    (await number(FONT_SIZE)) === 32,
    String(await number(FONT_SIZE)),
  );
  await app.page.keyboard.press("ControlOrMeta+g");
  await app.page.waitForTimeout(200);
  check(
    "Cmd/Ctrl+G shows the grid again",
    (await pressed("Grid")) === "true" && (await app.page.$(TEXT)) === null,
  );
  await app.page.keyboard.press("ControlOrMeta+g");
  check(
    "... and in the grid it changes nothing",
    (await pressed("Grid")) === "true",
  );
  const TOGGLE = 'button[aria-label="Toggle inspector"]';
  const inspectorShown = () => app.page.getAttribute(TOGGLE, "aria-pressed");
  const before = await inspectorShown();
  await app.page.keyboard.press("ControlOrMeta+i");
  await app.page.waitForTimeout(100);
  const flipped = await inspectorShown();
  await app.page.keyboard.press("ControlOrMeta+i");
  await app.page.waitForTimeout(100);
  check(
    "Cmd/Ctrl+I shows or hides the inspector, and again brings it back",
    flipped !== before && (await inspectorShown()) === before,
    `${before} -> ${flipped} -> ${await inspectorShown()}`,
  );
  check(
    "None of these keys reaches the window, where VS Code would take them",
    (await app.page.evaluate(() => window.seenKeys.join(""))) === "",
    await app.page.evaluate(() => window.seenKeys.join("")),
  );
}

export async function interfaceChecks({ fonts: { notoSans } }: Context) {
  // ---- the interface itself: names, empty states, the inspector, access -----
  if (notoSans) {
    const app = await open(FONTS.notoSans);
    const emptyText = () =>
      app.page.$eval(".grid-empty", (e) => e.textContent ?? "");
    const labels = await app.page.$$eval(".field-label", (ls) =>
      ls.map((l) => l.textContent),
    );
    check(
      "The dropdowns say what they are (Block, Show), and so does the size; the toolbar has no title",
      labels.join() === "Block,Show,Size" &&
        (await app.page.$(".toolbar-title")) === null,
      labels.join(),
    );

    await app.search("U+4E00");
    await app.clickCard(0);
    const panel = await app.inspector();
    check(
      "The inspector names the Unicode block and the state",
      panel.includes("CJK Unified Ideographs") && /Status\s*Drawn/.test(panel),
    );
    check(
      "A screen reader is told what is selected",
      (await app.page.$eval(
        '.sr-only[role="status"]',
        (e) => e.textContent,
      )) === "U+4E00, Drawn",
    );
    // The copy buttons put the code point and the character on the clipboard.
    await app.page.evaluate(() => {
      window.copied = [];
      navigator.clipboard.writeText = (text) => {
        window.copied.push(text);
        return Promise.resolve();
      };
    });
    await app.page.click('.inspector button:text-is("Copy code point")');
    await app.page.click('.inspector button:text-is("Copy character")');
    await app.page.waitForTimeout(100);
    const copied = await app.page.evaluate(() => window.copied.join("|"));
    const said = await app.page.$$eval(".inspector .button", (bs) =>
      bs.map((b) => b.textContent),
    );
    check(
      "Copy code point and Copy character put U+4E00 and 一 on the clipboard, and the buttons say Copied",
      copied === "U+4E00|一" && said.filter((t) => t === "Copied").length === 2,
      `${copied} / ${said.join(", ")}`,
    );
    await app.search("");

    await app.page.focus("#grid-viewport");
    await app.page.keyboard.press("/");
    check(
      "/ is a plain key again: it does not leave the grid",
      await app.page.evaluate(
        () => document.activeElement?.id === "grid-viewport",
      ),
    );
    await app.page.keyboard.press("ControlOrMeta+f");
    check(
      "Cmd/Ctrl+F moves the focus to the search box",
      await app.page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ===
          "Search by character or code point",
      ),
    );

    await viewAndSizeKeys(app);

    await app.pickBlock("Basic Latin (");
    await app.pick(SHOW, "undrawn");
    check(
      "Nothing undrawn in a complete block is said in the middle of the grid, as good news",
      (await emptyText()).includes("Nothing undrawn") &&
        (await emptyText()).includes("No glyph here is waiting to be drawn."),
    );
    await app.pick(SHOW, "missing");
    check(
      "Nothing missing, likewise",
      (await emptyText()).includes("Nothing missing"),
    );
    await app.pick(SHOW, "mapped");
    check(
      "A grid with glyphs has no empty state",
      (await app.page.$(".grid-empty")) === null,
    );

    await app.pickBlock("CJK Unified Ideographs (");
    await app.pick(SHOW, "undrawn");
    await app.search("U+4E00"); // drawn: the Show filter hides it
    check(
      "A match hidden by the Show filter: the empty grid says so and offers to show mapped glyphs",
      (await emptyText()).includes("Hidden by the Show filter") &&
        (await emptyText()).includes("Show mapped glyphs"),
    );
    await app.page.click(".grid-empty button");
    await app.page.waitForTimeout(300);
    check(
      "... and the button shows it",
      (await app.value(SHOW)) === "mapped" &&
        (await app.stats()).includes("1 result") &&
        (await app.page.$(".grid-empty")) === null,
    );
    await app.search("U+10FFFF");
    check(
      "Not in the font: said in the empty grid too",
      (await emptyText()).includes("Not in this font"),
    );
    await app.page.close();
  } else skip("The interface", "Noto Sans TC missing");
}
