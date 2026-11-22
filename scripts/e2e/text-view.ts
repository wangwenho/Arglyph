// The text view.

import { DEFAULT_SAMPLE } from "../../src/core/text/text.ts";
import { codepointKind } from "../../src/core/unicode/categories.ts";
import { FONTS } from "../fixtures/fonts.ts";
import {
  boxOf,
  type Context,
  check,
  inRange,
  marks,
  open,
  parseFont,
  SEARCH,
  SHOW,
  SWITCH,
  skip,
  TEXT,
  typeText,
  U,
} from "./harness.ts";

export async function textView({
  fonts: { synthesized, notoSans, latin },
}: Context) {
  // ---- the text view ----------------------------------------------

  if (notoSans) {
    const app = await open(FONTS.notoSans);
    // The scrollbar lies over the grid: the native one is gone, so the cards
    // run to the edge; the thumb shows while scrolling, can be dragged, and
    // fades.
    const thumb =
      '#grid-viewport ~ .overlay-scrollbar [data-axis="vertical"] > .overlay-thumb';
    const gridBox = () =>
      app.page.$eval("#grid-viewport", (e) => ({
        gap: (e as HTMLInputElement).offsetWidth - e.clientWidth,
        top: e.scrollTop,
        max: e.scrollHeight - e.clientHeight,
      }));
    const opacityOf = (selector: string) =>
      app.page.$eval(selector, (e) => Number(getComputedStyle(e).opacity));
    const gridState = await gridBox();
    check(
      "The grid has no scrollbar of its own: the cards use the whole width (only the left line is taken)",
      gridState.gap === 1 && gridState.max > 0,
      JSON.stringify(gridState),
    );
    await app.page.mouse.move(300, 300);
    await app.page.mouse.wheel(0, 400);
    await app.page.waitForTimeout(500);
    check(
      "Scrolling shows the overlay thumb",
      (await opacityOf(thumb)) === 1 && (await gridBox()).top > 0,
    );
    await app.page.waitForTimeout(1700);
    check(
      "... and it fades when the scrolling stops",
      (await opacityOf(thumb)) === 0,
    );
    const thumbRect = await boxOf(app.page, thumb);
    const before = (await gridBox()).top;
    await app.page.mouse.move(
      thumbRect.x + thumbRect.width / 2,
      thumbRect.y + thumbRect.height / 2,
    );
    await app.page.mouse.down();
    await app.page.mouse.move(
      thumbRect.x + thumbRect.width / 2,
      thumbRect.y + thumbRect.height / 2 + 120,
      { steps: 6 },
    );
    await app.page.mouse.up();
    await app.page.waitForTimeout(200);
    check(
      "Dragging the thumb scrolls the grid",
      (await gridBox()).top > before + 200,
      `${before} -> ${(await gridBox()).top}`,
    );
    await app.page.evaluate(() => {
      document.getElementById("grid-viewport")!.scrollTop = 0;
    });
    await app.page.waitForTimeout(100);

    const run = [...notoSans.cmap.keys()]
      .filter(inRange(0x4e00, 0x4e20))
      .sort((a, b) => a - b)
      .slice(0, 5);
    await app.search(`${U(run[0])}-${U(run[4]).slice(2)}`);
    await app.clickCard(1);
    // The line under the toolbar is also a legend you can press: the state's
    // chip shows just those glyphs. The search box has a clear button.
    await app.page.click(".stat-button:has-text('Drawn')");
    await app.page.waitForTimeout(350);
    check(
      "Pressing Drawn in the line under the toolbar shows just the drawn glyphs",
      (await app.value(SHOW)) === "drawn" &&
        (await app.page.$eval(".stat-button:has-text('Drawn')", (e) =>
          e.getAttribute("aria-pressed"),
        )) === "true",
      await app.value(SHOW),
    );
    await app.pick(SHOW, "mapped");
    await app.page.click(".stat-button:has-text('Blank')");
    await app.page.waitForTimeout(350);
    check(
      "Pressing Blank does the same: Show is Blank, as the list says",
      (await app.value(SHOW)) === "blank",
      await app.value(SHOW),
    );
    await app.pick(SHOW, "mapped");
    // The box holds a search here: the clear button is
    // there, clears it, and the search is put back for what follows.
    const typedSearch = await app.value(SEARCH);
    check(
      "With something typed in the search box there is a clear button",
      typedSearch !== "" && (await app.page.$(".search-clear")) !== null,
    );
    await app.page.click(".search-clear");
    await app.page.waitForTimeout(300);
    check(
      "... it clears the box and keeps the focus there",
      (await app.value(SEARCH)) === "" &&
        (await app.page.$(".search-clear")) === null &&
        (await app.page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ===
            "Search by character or code point",
        )),
    );
    await app.search(typedSearch);
    await app.clickCard(1);
    check(
      "The folding arrows of the inspector are drawn, not the browser's triangle",
      await app.page.$eval(".inspector summary", (e) => {
        const style = getComputedStyle(e);
        return (
          style.listStyleType === "none" &&
          getComputedStyle(e, "::before").content !== "none"
        );
      }),
    );

    // The inspector can be resized: drag its edge, double-click to reset, the
    // arrow keys on the handle; it keeps within its range and leaves the grid
    // room.
    const frameWidth = () =>
      app.page.$eval(
        ".inspector-frame",
        (e) => e.getBoundingClientRect().width,
      );
    const drag = async (dx: number) => {
      const sash = await boxOf(app.page, ".inspector-sash");
      const x = sash.x + sash.width / 2;
      const y = sash.y + sash.height / 2;
      await app.page.mouse.move(x, y);
      await app.page.mouse.down();
      await app.page.mouse.move(x + dx, y, { steps: 8 });
      await app.page.mouse.up();
      await app.page.waitForTimeout(250);
    };
    const inspectorBefore = await frameWidth();
    await drag(-80);
    const inspectorWider = await frameWidth();
    check(
      "Dragging the inspector's edge to the left makes it wider by as much",
      Math.abs(inspectorWider - (inspectorBefore + 80)) <= 1,
      `${inspectorBefore} -> ${inspectorWider}`,
    );
    await drag(-2000);
    const inspectorWidest = await frameWidth();
    const stageWidth = await app.page.$eval(
      ".stage",
      (e) => e.getBoundingClientRect().width,
    );
    check(
      "... but not past 480 px, and the grid keeps its room",
      inspectorWidest <= 480 && stageWidth >= 320,
      `${inspectorWidest} / ${stageWidth}`,
    );
    await drag(2000);
    check(
      "... nor under 240 px",
      (await frameWidth()) === 240,
      String(await frameWidth()),
    );
    await app.page.dblclick(".inspector-sash");
    await app.page.waitForTimeout(150);
    check(
      "A double click puts it back to 300 px",
      (await frameWidth()) === 300,
      String(await frameWidth()),
    );
    await app.page.focus(".inspector-sash");
    await app.page.keyboard.press("ArrowLeft");
    await app.page.waitForTimeout(100);
    check(
      "The arrow keys on the handle move it 16 px at a time",
      (await frameWidth()) === 316 &&
        (await app.page.$eval(".inspector-sash", (e) =>
          e.getAttribute("aria-valuenow"),
        )) === "316",
      String(await frameWidth()),
    );
    await app.page.dblclick(".inspector-sash");
    // The grid lays itself out again at its old width.
    await app.page.waitForTimeout(400);

    // The size of the cards: a box that cannot be typed in, with − and + that
    // go from one column count to the next, so the number is the real size.
    const GLYPH_SIZE = 'input[aria-label="Glyph size"]';
    const shownSize = async () =>
      Number(
        await app.page.$eval(GLYPH_SIZE, (e) => (e as HTMLInputElement).value),
      );
    const switchLeft = () =>
      app.page.$eval(".segmented", (e) => e.getBoundingClientRect().left);
    const sizeBefore = await shownSize();
    const spacerBefore = await app.spacer();
    const gridSwitchLeft = await switchLeft();
    await app.page.click('button[aria-label="Increase glyph size"]');
    await app.page.waitForTimeout(250);
    const sizeAfter = await shownSize();
    check(
      "The grid's size box is read-only; + makes the cards bigger and the box shows the size they have",
      (await app.page.$eval(
        GLYPH_SIZE,
        (e) => (e as HTMLInputElement).readOnly,
      )) &&
        sizeAfter > sizeBefore &&
        sizeAfter <= 128,
      `${sizeBefore} -> ${sizeAfter}`,
    );
    await app.page.click('button[aria-label="Decrease glyph size"]');
    await app.page.waitForTimeout(250);
    check(
      "... and − brings the same size back",
      (await shownSize()) === sizeBefore &&
        (await app.spacer()) === spacerBefore,
      `${await shownSize()} vs ${sizeBefore}`,
    );
    await app.page.click(SWITCH("Text"));
    await app.page.waitForSelector(".text-view");
    await app.page.waitForTimeout(400);
    const seeded = DEFAULT_SAMPLE;
    check(
      "Text shows the text view; it starts with the default sample",
      (await app.value(TEXT)) === seeded,
      `${await app.value(TEXT)} vs ${seeded}`,
    );
    check(
      "The Grid | Text switch does not move when the view changes",
      Math.abs((await switchLeft()) - gridSwitchLeft) < 0.5 &&
        gridSwitchLeft < 60,
      `${gridSwitchLeft} -> ${await switchLeft()}`,
    );
    check(
      "The box has the keyboard",
      await app.page.evaluate(
        () => document.activeElement?.tagName === "TEXTAREA",
      ),
    );
    check(
      "What belongs to the grid is out of reach, and the size is the font size",
      (await app.page.$eval(
        ".toolbar-controls",
        (e) => (e as HTMLInputElement).inert,
      )) &&
        (await app.page.$('input[aria-label="Font size"]')) !== null &&
        (await app.page.$(".zoom-slider")) === null,
    );
    const stats = await app.stats();
    check(
      "The line under the toolbar is about the text: its characters, none missing",
      stats.includes("Text") &&
        // spaces are not characters of the text, they only separate
        stats.includes(
          `${[...DEFAULT_SAMPLE].filter((c) => !/\s/.test(c)).length} characters`,
        ) &&
        stats.includes("Every character is in the font"),
      stats,
    );

    // How the text is set: direction, line spacing, letter spacing, and the
    // font size as a number. They take the place of the grid's block, show and
    // search while the text is shown.
    const LINE = 'input[aria-label="Line spacing"]';
    const LETTER = 'input[aria-label="Letter spacing"]';
    const SIZE = 'input[aria-label="Font size"][type=number]';
    const VERTICAL = 'button[aria-label^="Vertical text"]';
    const HORIZONTAL = 'button[aria-label^="Horizontal text"]';
    const setting = (property: string) =>
      app.page.$eval(
        ".text-input",
        (e, property) => {
          const style = getComputedStyle(e);
          return style[property as keyof CSSStyleDeclaration] as string;
        },
        property,
      );
    check(
      "In the text view the toolbar has the direction, line and letter spacing, and the font size as a number; the grid's controls are gone",
      (await app.page.$(VERTICAL)) !== null &&
        (await app.page.$(LINE)) !== null &&
        (await app.page.$(LETTER)) !== null &&
        (await app.page.$eval(SIZE, (e) => (e as HTMLInputElement).value)) ===
          "32" &&
        (await app.page.$eval(
          ".toolbar-controls",
          (e) => (e as HTMLInputElement).hidden,
        )) &&
        !(await app.page.isVisible(SEARCH)),
    );
    check(
      "Unchanged, the text is set as before: horizontal, 1.5 lines, no letter spacing",
      (await setting("lineHeight")) === "48px" &&
        (await setting("letterSpacing")) === "normal" &&
        (await setting("writingMode")) === "horizontal-tb" &&
        (await app.page.$eval(LINE, (e) => (e as HTMLInputElement).value)) ===
          "1.5",
      `${await setting("lineHeight")} ${await setting("letterSpacing")}`,
    );

    await app.page.fill(LINE, "2");
    await app.page.fill(LETTER, "10");
    await app.page.waitForTimeout(150);
    check(
      "Line spacing is a multiple of the font size and letter spacing a share of it; the box and its copy have both",
      (await setting("lineHeight")) === "64px" &&
        (await setting("letterSpacing")) === "3.2px" &&
        (await app.page.$eval(".text-mirror", (e) => {
          const style = getComputedStyle(e);
          return `${style.lineHeight} ${style.letterSpacing}`;
        })) === "64px 3.2px",
      `${await setting("lineHeight")} ${await setting("letterSpacing")}`,
    );
    await app.page.fill(LINE, "");
    await app.page.waitForTimeout(150);
    check(
      "An empty line spacing is the font's own (Auto)",
      (await setting("lineHeight")) === "normal",
    );
    await app.page.fill(LETTER, "99");
    await app.page.waitForTimeout(150);
    check(
      "A number out of range is not taken, and the box shows the kept value when the focus leaves",
      (await setting("letterSpacing")) === "3.2px" &&
        (await (async () => {
          await app.page.focus(TEXT);
          return app.page.$eval(LETTER, (e) => (e as HTMLInputElement).value);
        })()) === "10",
    );
    await app.page.fill(SIZE, "48");
    await app.page.waitForTimeout(150);
    check("The font size can be typed", (await setting("fontSize")) === "48px");
    await app.page.click('button[aria-label="Increase font size"]');
    await app.page.waitForTimeout(100);
    check(
      "The + of the font size adds 4 pixels, and the box shows it",
      (await setting("fontSize")) === "52px" &&
        (await app.page.$eval(SIZE, (e) => (e as HTMLInputElement).value)) ===
          "52",
    );
    await app.page.click('button[aria-label="Decrease font size"]');
    await app.page.click('button[aria-label="Decrease font size"]');
    await app.page.waitForTimeout(100);
    check(
      "... and the − takes them away",
      (await setting("fontSize")) === "44px",
    );
    // Held, the button keeps stepping.
    const minus = await boxOf(
      app.page,
      'button[aria-label="Decrease font size"]',
    );
    await app.page.mouse.move(minus.x + 5, minus.y + 5);
    await app.page.mouse.down();
    // Stepping from 44px to 12px takes about 0.9 s (400 ms before it repeats,
    // then 70 ms a step), so a fixed 1 s wait fails on a slow runner. Wait for
    // the smallest size instead, then hold a little longer to see it stop.
    await app.page.waitForFunction(
      () =>
        (
          document.querySelector(
            'button[aria-label="Decrease font size"]',
          ) as HTMLButtonElement
        ).disabled,
      undefined,
      { timeout: 5000 },
    );
    await app.page.waitForTimeout(300);
    await app.page.mouse.up();
    check(
      "A held button keeps stepping, down to the smallest size, where it stops",
      (await setting("fontSize")) === "12px" &&
        (await app.page.$eval(
          'button[aria-label="Decrease font size"]',
          (e) => (e as HTMLInputElement).disabled,
        )),
      await setting("fontSize"),
    );
    await app.page.press(SIZE, "Enter");
    check(
      "Enter in a field gives the keys back to the text",
      await app.page.evaluate(
        () => document.activeElement?.tagName === "TEXTAREA",
      ),
    );
    await app.page.fill(SIZE, "32");
    await app.page.fill(LINE, "1.5");
    await app.page.fill(LETTER, "0");

    // Vertical: columns from the right, each running down. The box and its copy
    // must still be one on top of the other, the text starts at the right edge
    // and the wheel walks the columns.
    await typeText(app, "永字八法：天地玄黃，宇宙洪荒。\n".repeat(40));
    await app.page.click(VERTICAL);
    await app.page.waitForTimeout(300);
    const geometry = () =>
      app.page.evaluate(() => {
        const box = document
          .querySelector(".text-input")!
          .getBoundingClientRect();
        const copy = document
          .querySelector(".text-mirror")!
          .getBoundingClientRect();
        const scroll = document.querySelector(".text-scroll") as HTMLElement;
        return {
          mode: getComputedStyle(
            document.querySelector(".text-input") as Element,
          ).writingMode,
          box: [box.top, box.right, box.bottom],
          copy: [copy.top, copy.right, copy.bottom],
          left: scroll.scrollLeft,
          wider: scroll.scrollWidth > scroll.clientWidth,
          tall: Math.abs(box.height - scroll.clientHeight) < 1,
        };
      });
    let vertical = await geometry();
    check(
      "Vertical: the box and its copy are both vertical and in the same place, as tall as the window and wider than it, starting at the right",
      vertical.mode === "vertical-rl" &&
        JSON.stringify(vertical.box) === JSON.stringify(vertical.copy) &&
        vertical.tall &&
        vertical.wider &&
        vertical.left === 0,
      JSON.stringify(vertical),
    );
    await app.page.mouse.move(300, 300);
    await app.page.mouse.wheel(0, 200);
    await app.page.waitForTimeout(200);
    vertical = await geometry();
    check(
      "Vertical: the mouse wheel walks the columns (down goes to the left)",
      vertical.left === -200,
      String(vertical.left),
    );
    // Pointing at a character with Cmd/Ctrl held finds it among the columns.
    await app.page.evaluate(() => {
      (document.querySelector(".text-scroll") as HTMLInputElement).scrollLeft =
        0;
    });
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    const at = await app.page.evaluate(() => {
      const node = document
        .createTreeWalker(
          document.querySelector(".text-mirror") as Element,
          NodeFilter.SHOW_TEXT,
        )
        .nextNode() as Node;
      const range = document.createRange();
      range.setStart(node, 20);
      range.setEnd(node, 21);
      const box = range.getBoundingClientRect();
      return {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        char: (node as Text).data[20],
      };
    });
    await app.page.keyboard.down(modKey);
    await app.page.mouse.move(at.x, at.y);
    await app.page.mouse.move(at.x + 1, at.y + 1);
    await app.page.waitForTimeout(250);
    const columnLinks = await app.page.$$eval(".text-link", (es) =>
      es.map((e) => e.textContent),
    );
    await app.page.keyboard.up(modKey);
    check(
      "Vertical: the character under the pointer is the one a Cmd/Ctrl+click would look at",
      columnLinks.length === 1 && columnLinks[0] === at.char,
      `${JSON.stringify(columnLinks)} vs ${at.char}`,
    );
    await app.page.click(SWITCH("Grid"));
    await app.page.click(SWITCH("Text"));
    await app.page.waitForSelector(".text-view");
    check(
      "The way the text is set stays when the grid is shown and the text again",
      (await app.page.$eval(VERTICAL, (e) =>
        e.getAttribute("aria-pressed"),
      )) === "true" && (await setting("writingMode")) === "vertical-rl",
    );
    await app.page.click(HORIZONTAL);
    await app.page.waitForTimeout(200);
    await typeText(app, "");

    // The text is set in the font itself, not in what the browser has: the
    // width of "iiii" is what the font's advance for "i" says.
    await typeText(app, "iiii");
    const font = parseFont(FONTS.notoSans);
    const advance = font.glyphs.get(font.charToGlyphIndex("i"))
      .advanceWidth as number;
    const shown = await app.page.evaluate(() => ({
      // The copy behind the box has the text laid out as the box does.
      width: document
        .querySelector(".text-mirror span")!
        .getBoundingClientRect().width,
      family: getComputedStyle(document.querySelector(".text-input") as Element)
        .fontFamily,
      size: Number.parseFloat(
        getComputedStyle(document.querySelector(".text-input") as Element)
          .fontSize,
      ),
    }));
    const wanted = (4 * advance * shown.size) / font.unitsPerEm;
    check(
      "The text is set in the font: its width is the advance the font gives",
      shown.family.includes("ArglyphTextFace") &&
        Math.abs(shown.width - wanted) < 1,
      `${shown.width.toFixed(2)} px vs ${wanted.toFixed(2)} px, ${shown.family}`,
    );

    // A character the font lacks is marked, one it has is not.
    let first = 0x4e00;
    while (notoSans.cmap.has(first)) first++;
    await typeText(app, `A${String.fromCodePoint(first)}B`);
    const missing = await marks(app, "missing");
    check(
      "A character the font lacks is marked; the others are not",
      missing.length === 1 &&
        missing[0].text === String.fromCodePoint(first) &&
        (await app.page.$$(".text-mark")).length === 1,
      JSON.stringify(missing),
    );
    const idle = await app.inspector();
    check(
      "The line under the toolbar counts it; after typing, the inspector shows the character just written",
      (await app.stats()).includes("Missing 1") &&
        idle.includes(U(0x42)) &&
        /Hold (Cmd|Ctrl) and point/.test(idle) &&
        !idle.includes("Not in this font") &&
        !idle.includes("Marks"),
      idle.slice(0, 200),
    );

    // The marks are drawn on a copy of the text behind the box, so the copy must
    // put every character exactly where the box does. Draw the box alone, then
    // the copy alone in the same color, and compare the two pictures: where one
    // has ink and the other has not, a character is out of place (a line break
    // that differs, a single character that drifts). At a wide and a narrow window.
    const line =
      "永字八法：天地玄黃，宇宙洪荒。The quick brown fox jumps over the lazy dog 0123456789\n";
    const paragraph = [
      line.repeat(5),
      String.fromCodePoint(first),
      "末 iiiiiiiiii 國語",
    ].join("");
    await typeText(app, paragraph);
    const shot = async (css: string) => {
      await app.page.evaluate((css) => {
        let style = document.getElementById("probe");
        if (!style) {
          style = document.createElement("style");
          style.id = "probe";
          document.head.append(style);
        }
        style.textContent = css;
      }, css);
      await app.page.waitForTimeout(100);
      return (await app.page.locator(".text-stack").screenshot()).toString(
        "base64",
      );
    };
    const compare = (a: string, b: string) =>
      app.page.evaluate(
        async ([a, b]) => {
          const read = async (b64: string) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
            ctx.drawImage(img, 0, 0);
            return ctx.getImageData(0, 0, img.width, img.height).data;
          };
          const [x, y] = [await read(a), await read(b)];
          let ink = 0;
          let apart = 0;
          for (let i = 0; i < x.length; i += 4) {
            const gx = (x[i] + x[i + 1] + x[i + 2]) / 3;
            const gy = (y[i] + y[i + 1] + y[i + 2]) / 3;
            if (gx < 110) ink++;
            if (Math.abs(gx - gy) > 90) apart++;
          }
          return { ink, apart, same: x.length === y.length };
        },
        [a, b],
      );
    // The box's text is not drawn and a marked character is blank in the copy;
    // for this comparison the box draws its own text, and a marked character is
    // drawn like any other, so the two are of the same text.
    const noMarks =
      ".text-mark { color: var(--glyph-fg) !important; background: none !important; text-decoration: none !important; outline: none !important }";
    for (const width of [1200, 480]) {
      await app.page.setViewportSize({ width, height: 760 });
      await app.page.waitForTimeout(300);
      const box = await shot(
        `.text-mirror { visibility: hidden }
         .text-input { color: var(--glyph-fg) !important; caret-color: transparent } ${noMarks}`,
      );
      const copy = await shot(
        `.text-input { caret-color: transparent } ${noMarks}`,
      );
      const diff = await compare(box, copy);
      check(
        `The copy behind the text lies exactly under it at ${width}px: the two pictures agree`,
        diff.same && diff.ink > 1000 && diff.apart / diff.ink < 0.02,
        `${diff.apart} of ${diff.ink} ink pixels differ`,
      );
    }
    await app.page.setViewportSize({ width: 1200, height: 760 });
    await shot("");

    // Typing with an IME: the letters under the underline are not text yet.
    const ime = (text: string, final: boolean) =>
      app.page.evaluate(
        ([text, final]) => {
          const box = document.querySelector(
            "textarea.text-input",
          ) as HTMLTextAreaElement;
          const set = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          )?.set as (this: HTMLTextAreaElement, value: string) => void;
          if (!final)
            box.dispatchEvent(
              new CompositionEvent("compositionstart", { bubbles: true }),
            );
          set.call(box, text);
          box.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "insertCompositionText",
              isComposing: true,
              data: text,
            }),
          );
          if (final)
            box.dispatchEvent(
              new CompositionEvent("compositionend", {
                bubbles: true,
                data: text,
              }),
            );
        },
        [text, final] as [string, boolean],
      );
    await typeText(app, "ab");
    await ime("abㄍ", false);
    await app.page.waitForTimeout(250);
    check(
      "IME: the letters being composed do not change the preview",
      (await app.stats()).includes("2 characters"),
      await app.stats(),
    );
    await ime("ab國", true);
    await app.page.waitForTimeout(250);
    check(
      "IME: the finished character does",
      (await app.stats()).includes("3 characters"),
      await app.stats(),
    );

    // A character of the text, looked at: click it and the side panel shows it,
    // Cmd/Ctrl+click or Cmd/Ctrl+Enter opens the zoom view on it, which walks the
    // characters of the text, and Esc comes back to the box where it was left.
    const sample = `${String.fromCodePoint(run[1], run[2], run[3])}${String.fromCodePoint(first)}A`;
    await typeText(app, sample);
    // The middle of the k-th character, as the copy behind the box lays it out.
    const centerOf = (k: number) =>
      app.page.evaluate((k) => {
        const mirror = document.querySelector(".text-mirror") as Element;
        const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
        // The characters are in several nodes (the marked one has its own).
        let offset = k;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (offset < (node as Text).data.length) {
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + 1);
            const box = range.getBoundingClientRect();
            return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          }
          offset -= (node as Text).data.length;
        }
        return null;
      }, k);
    const clickChar = async (k: number, modifier?: string) => {
      const at = (await centerOf(k)) as { x: number; y: number };
      if (modifier) await app.page.keyboard.down(modifier);
      await app.page.mouse.click(at.x, at.y);
      if (modifier) await app.page.keyboard.up(modifier);
      await app.page.waitForTimeout(250);
    };
    // A plain click is only a click: it puts the caret and nothing else happens.
    await clickChar(2);
    let panel = await app.inspector();
    const caretAfterClick = await app.page.evaluate(
      () =>
        (document.querySelector("textarea.text-input") as HTMLInputElement)
          .selectionStart,
    );
    check(
      "A plain click puts the caret and the side panel shows the character at it; no zoom view",
      panel.includes("Status") &&
        (await app.page.$(".zoom")) === null &&
        (caretAfterClick as number) >= 2,
      `caret ${caretAfterClick}`,
    );
    // The arrow keys walk the text and the side panel follows the caret.
    await app.page.evaluate(() => {
      const box = document.querySelector("textarea.text-input");
      (box as HTMLInputElement).focus();
      (box as HTMLInputElement).setSelectionRange(0, 0);
    });
    const arrow = async (key: string) => {
      await app.page.keyboard.press(key);
      await app.page.waitForTimeout(200);
      return app.inspector();
    };
    panel = await arrow("ArrowRight");
    check(
      "An arrow key shows the character the caret is at in the side panel",
      panel.includes(U(run[2])) && panel.includes("Glyph index"),
      panel.slice(0, 160),
    );
    panel = await arrow("ArrowRight");
    check("... and the next one", panel.includes(U(run[3])));
    panel = await arrow("ArrowRight");
    check(
      "... including a character the font lacks, shown as missing, with nothing to describe",
      panel.includes(U(first)) &&
        /Status\s*Missing/.test(panel) &&
        panel.includes(`Character${String.fromCodePoint(first)}`) &&
        !panel.includes("Glyph index"),
      panel.slice(0, 200),
    );
    panel = await arrow("ArrowLeft");
    check("... and back", panel.includes(U(run[3])));
    // On a Mac, Ctrl+click is a right click and sends no click: Cmd is its key.
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    // With Cmd/Ctrl held, the character under the pointer is drawn like a link and
    // the pointer is a hand: that is where a click will look closer.
    const cursorOfBox = () =>
      app.page.$eval("textarea.text-input", (e) => getComputedStyle(e).cursor);
    const links = () =>
      app.page.$$eval(".text-link", (els) =>
        els.map((e) => ({
          text: e.textContent,
          color: getComputedStyle(e).color,
          background: getComputedStyle(e).backgroundColor,
        })),
      );
    const hoverAt = async (k: number) => {
      const at = (await centerOf(k)) as { x: number; y: number };
      await app.page.mouse.move(at.x, at.y);
      await app.page.waitForTimeout(150);
    };
    await hoverAt(1);
    check(
      "Without Cmd/Ctrl nothing says a character can be clicked: a text cursor, no link",
      (await cursorOfBox()) !== "pointer" && (await links()).length === 0,
      await cursorOfBox(),
    );
    await app.page.keyboard.down(mod);
    await app.page.waitForTimeout(150);
    let linked = await links();
    const [red, , blue] = (linked[0]?.color.match(/\d+/g) ?? []).map(Number);
    check(
      "Pressing Cmd/Ctrl over a character makes it a link: a hand pointer, that character alone in the link color",
      (await cursorOfBox()) === "pointer" &&
        linked.length === 1 &&
        linked[0].text === String.fromCodePoint(run[2]) &&
        blue > red + 60,
      JSON.stringify(linked),
    );
    await hoverAt(0);
    linked = await links();
    check(
      "Moving to the next character moves the link with it",
      linked.length === 1 && linked[0].text === String.fromCodePoint(run[1]),
      JSON.stringify(linked),
    );
    await hoverAt(3);
    linked = await links();
    check(
      "A character the font lacks is a link too: the hand, and a blue tint on its blank",
      (await cursorOfBox()) === "pointer" &&
        linked.length === 1 &&
        linked[0].background !== "rgba(0, 0, 0, 0)",
      JSON.stringify(linked),
    );
    // Below the text there is no character: the box takes the pointer as a box.
    const box = await boxOf(app.page, "textarea.text-input");
    await app.page.mouse.move(box.x + 300, box.y + box.height - 20);
    await app.page.waitForTimeout(150);
    check(
      "Over no character, with the key held, it is not a link",
      (await cursorOfBox()) !== "pointer" && (await links()).length === 0,
    );
    await hoverAt(1);
    await app.page.keyboard.up(mod);
    await app.page.waitForTimeout(150);
    check(
      "Letting go of the key, the pointer still, ends it",
      (await cursorOfBox()) !== "pointer" && (await links()).length === 0,
    );
    await app.page.keyboard.down(mod);
    await app.page.waitForTimeout(150);
    check(
      "... and pressing it again, the pointer still, brings it back",
      (await links()).length === 1,
    );
    // Pointing at a character with the key held shows it in the side panel, and the
    // panel keeps it when the key is let go.
    const codePointOf = (text: string) => /U\+[0-9A-F]{4,6}/.exec(text)?.[0];
    // The character after the caret, which is what the panel goes back to.
    const atCaret = U(
      await app.page.evaluate(() => {
        const box = document.querySelector("textarea.text-input");
        return (box as HTMLTextAreaElement).value.codePointAt(
          (box as HTMLTextAreaElement).selectionStart as number,
        ) as number;
      }),
    );
    await app.page.keyboard.down(mod);
    await hoverAt(0);
    panel = await app.inspector();
    check(
      "With Cmd/Ctrl held, pointing at a character shows it in the side panel",
      panel.includes(U(run[1])) && panel.includes("Glyph index"),
      panel.slice(0, 160),
    );
    await app.page.keyboard.up(mod);
    await app.page.waitForTimeout(150);
    await app.page.mouse.move(box.x + 300, box.y + box.height - 20);
    await app.page.waitForTimeout(150);
    check(
      "... and when the key is let go it goes back to the character at the caret",
      codePointOf(await app.inspector()) === atCaret,
      `${atCaret} vs ${codePointOf(await app.inspector())}`,
    );
    await clickChar(1, mod);
    await app.page.waitForSelector(".zoom");
    const caretBefore = await app.page.evaluate(
      () =>
        (document.querySelector("textarea.text-input") as HTMLInputElement)
          .selectionStart,
    );
    check(
      "Cmd/Ctrl+click opens the zoom view on that character, over the text",
      (
        await app.page.$eval(
          ".zoom-surface",
          (e) => e.getAttribute("aria-label") ?? "",
        )
      ).includes(U(run[2])) &&
        (await app.page.$eval(
          ".text-view",
          (e) => (e as HTMLInputElement).inert,
        )) &&
        (await app.inspector()).includes("Layers"),
    );
    await app.page.keyboard.press("ArrowRight");
    await app.page.waitForTimeout(250);
    check(
      "In it the arrow keys walk the characters of the text, not the grid",
      (
        await app.page.$eval(
          ".zoom-surface",
          (e) => e.getAttribute("aria-label") ?? "",
        )
      ).includes(U(run[3])) && (await app.inspector()).includes(U(run[3])),
    );
    await app.page.keyboard.press("ArrowRight");
    await app.page.waitForTimeout(250);
    check(
      "... including the one the font lacks, which says so",
      (await app.inspector()).includes("Missing"),
    );
    await app.page.keyboard.press("Escape");
    await app.page.waitForTimeout(250);
    const back = await app.page.evaluate(() => {
      const box = document.querySelector("textarea.text-input");
      return {
        focused: document.activeElement === box,
        inert: (document.querySelector(".text-view") as HTMLInputElement).inert,
        caret: (box as HTMLInputElement).selectionStart,
        value: (box as HTMLInputElement).value,
      };
    });
    check(
      "Esc comes back to the text: the box has the keys, the text and the caret are as they were",
      (await app.page.$(".zoom")) === null &&
        back.focused &&
        !back.inert &&
        back.value === sample &&
        back.caret === caretBefore,
      JSON.stringify(back),
    );
    // The same from the keyboard: Cmd/Ctrl+Enter, for the character at the caret.
    await app.page.evaluate(() => {
      const box = document.querySelector("textarea.text-input");
      (box as HTMLInputElement).focus();
      (box as HTMLInputElement).setSelectionRange(1, 1);
    });
    await app.page.keyboard.press(`${mod}+Enter`);
    await app.page.waitForSelector(".zoom");
    check(
      "Cmd/Ctrl+Enter opens the zoom view on the character after the caret",
      (
        await app.page.$eval(
          ".zoom-surface",
          (e) => e.getAttribute("aria-label") ?? "",
        )
      ).includes(U(run[2])),
    );
    await app.page.keyboard.press("Escape");
    await app.page.waitForTimeout(200);

    // Back and forth: the grid is as it was, and the text is the user's.
    await typeText(app, "xyz");
    await app.page.click(SWITCH("Grid"));
    await app.page.waitForTimeout(250);
    check(
      "Grid goes back: the text view is gone, the grid has the keys, the selection is kept",
      (await app.page.$(".text-view")) === null &&
        (await app.page.evaluate(() => document.activeElement?.id)) ===
          "grid-viewport" &&
        (await app.inspector()).includes(U(run[1])),
    );
    await app.page.click(SWITCH("Text"));
    await app.page.waitForSelector(".text-view");
    check("The text typed is still there", (await app.value(TEXT)) === "xyz");
    // Nothing in the box when the view is shown: it starts from the grid again.
    await typeText(app, "");
    await app.page.click(SWITCH("Grid"));
    await app.page.waitForTimeout(250);
    await app.page.click(SWITCH("Text"));
    await app.page.waitForSelector(".text-view");
    check(
      "An empty text starts again from the default sample when the view is shown",
      (await app.value(TEXT)) === seeded,
    );
    await app.page.close();
  } else skip("Text view", "Noto Sans TC missing");

  if (synthesized) {
    // A glyph with no outline where Unicode expects ink is marked as undrawn.
    const app = await open(FONTS.synthesized);
    const undrawn = [...synthesized.cmap].find(
      ([cp, g]) => synthesized.empty(g) && codepointKind(cp) === "ink",
    )?.[0] as number;
    await app.page.click(SWITCH("Text"));
    await app.page.waitForSelector(".text-view");
    await typeText(app, String.fromCodePoint(undrawn));
    const found = await marks(app, "undrawn");
    const style = await app.page.$eval(".text-mark-undrawn", (e) => {
      const c = getComputedStyle(e);
      return {
        line: c.textDecorationLine,
        kind: c.textDecorationStyle,
        outline: c.outlineStyle,
        background: c.backgroundColor,
      };
    });
    check(
      "Undrawn is a dashed underline and a tint, not a box, like Missing",
      style.line.includes("underline") &&
        style.kind === "dashed" &&
        style.outline === "none" &&
        style.background !== "rgba(0, 0, 0, 0)",
      JSON.stringify(style),
    );
    check(
      "A glyph with no outline where ink is expected is marked as undrawn",
      found.length === 1 &&
        found[0].text === String.fromCodePoint(undrawn) &&
        (await app.stats()).includes("Undrawn 1"),
      JSON.stringify(found),
    );
    await app.page.close();
  } else skip("Undrawn in text", "the synthesized font is missing");

  if (latin) {
    // The point of marking: a font with no CJK looks as if it had some.
    const app = await open(FONTS.latin);
    await app.page.click(SWITCH("Text"));
    await app.page.waitForSelector(".text-view");
    await typeText(app, "A國");
    const found = await marks(app, "missing");
    check(
      "A font without CJK: the CJK character the browser would fill in from another font is marked",
      found.length === 1 && found[0].text === "國",
      JSON.stringify(found),
    );
    // Marked, and blank: no glyph from another font shows, as in the grid. The
    // tint and the dashed line are taken away so that only a glyph could be ink.
    await app.page.addStyleTag({
      content:
        ".text-mark-missing { background: none !important; text-decoration: none !important }",
    });
    const inkIn = async (selector: string, index: number) => {
      const rect = await app.page.evaluate(
        ([selector, index]) => {
          const r = document
            .querySelectorAll(selector)
            [index].getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        },
        [selector, index] as [string, number],
      );
      const png = await app.page.screenshot({ clip: rect });
      return app.page.evaluate(async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);
        let dark = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i] < 150 && data[i + 1] < 150 && data[i + 2] < 150) dark++;
        return dark;
      }, png.toString("base64"));
    };
    const blankInk = await inkIn(".text-mark-missing", 0);
    const letterInk = await inkIn(".text-mirror > span", 0);
    check(
      "A missing character is blank, not a glyph from another font; a character the font has is not",
      blankInk === 0 && letterInk > 20,
      `${blankInk} dark pixels for the missing one, ${letterInk} for the A`,
    );
    await app.page.close();
  } else skip("Text in a Latin font", "Lato missing");
}
