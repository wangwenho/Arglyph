// The zoom view, drawn and CFF.

import { FONTS } from "../fixtures/fonts.ts";
import {
  boxOf,
  type Context,
  check,
  inRange,
  open,
  parseFont,
  SHOW,
  skip,
  U,
} from "./harness.ts";

export async function zoom({ fonts: { notoSans, notoSerif } }: Context) {
  // ---- the zoom view ---------------------------------------------
  if (notoSans) {
    const app = await open(FONTS.notoSans);
    const label = () =>
      app.page.$eval(".zoom-level", (e) => e.textContent ?? "");
    const zoomOpen = async () => (await app.page.$(".zoom")) !== null;
    const focusId = () =>
      app.page.evaluate(
        () => document.activeElement?.className || document.activeElement?.id,
      );
    // The box around the dark pixels of the zoom canvas: the glyph's fill.
    const ink = () =>
      app.page.evaluate(() => {
        const canvas = document.querySelector(
          ".zoom canvas",
        ) as HTMLCanvasElement;
        const { data, width, height } = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height);
        let x1 = width;
        let y1 = height;
        let x2 = -1;
        let y2 = -1;
        // Not the rulers: their numbers are as dark as the ink on a light theme.
        const ratio = canvas.width / canvas.clientWidth;
        for (let y = Math.ceil(23 * ratio); y < height; y++) {
          for (let x = Math.ceil(43 * ratio); x < width; x++) {
            const i = (y * width + x) * 4;
            // Near the ink color itself: the words on the guides are dark too.
            if (data[i] < 36 && data[i + 1] < 39 && data[i + 2] < 47) {
              if (x < x1) x1 = x;
              if (x > x2) x2 = x;
              if (y < y1) y1 = y;
              if (y > y2) y2 = y;
            }
          }
        }
        return {
          x1,
          y1,
          x2,
          y2,
          ratio: canvas.width / canvas.clientWidth,
        };
      });
    const surface = () => boxOf(app.page, ".zoom-surface");

    // The first few code points of the font from U+4E00 on (it lacks some).
    const run = [...notoSans.cmap.keys()]
      .filter(inRange(0x4e00, 0x4e20))
      .sort((a, b) => a - b)
      .slice(0, 5);
    await app.search(`${U(run[0])}-${U(run[4]).slice(2)}`);
    await app.clickCard(1);
    const before = await app.page.evaluate(
      () => document.getElementById("grid-viewport")!.scrollTop,
    );
    await app.page.keyboard.press("Space");
    await app.page.waitForSelector(".zoom");
    await app.page.waitForTimeout(250);
    check(
      "Space opens the zoom view over the grid; it has the keys, the grid is out of reach",
      (await zoomOpen()) &&
        (await focusId()) === "zoom-surface" &&
        (await app.page.$eval(".stage-grid", (e) => (e as HTMLElement).inert)),
      String(await focusId()),
    );
    check(
      "The inspector shows the layer switches instead of the small preview",
      (await app.page.$(".glyph-preview")) === null &&
        (await app.page.$$eval(".layer-list input", (is) =>
          is.map((i) => (i as HTMLInputElement).checked).join(),
        )) === "true,false,false,true,false,false,false,true,false",
    );
    check(
      "It starts fitted: 1.0×, and Fit has nothing to do",
      (await label()) === "1.0×" &&
        (await app.page.$eval(
          ".zoom-fit",
          (b) => (b as HTMLButtonElement).disabled,
        )),
    );

    // The ink of the second result on the screen is as big as the font says it is.
    const font4e01 = parseFont(FONTS.notoSans);
    const box = font4e01.glyphs
      .get(font4e01.charToGlyphIndex(String.fromCodePoint(run[1])))
      .getBoundingBox();
    const area = await surface();
    const fit =
      (Math.min(area.width, area.height) * 0.76) / font4e01.unitsPerEm;
    let shown = await ink();
    const width = (shown.x2 - shown.x1 + 1) / shown.ratio;
    check(
      "Fitted, the glyph is drawn at the size the font gives it",
      Math.abs(width - (box.x2 - box.x1) * fit) < 3,
      `${width.toFixed(1)} px, expected ${((box.x2 - box.x1) * fit).toFixed(1)}`,
    );

    // The bounding box in the inspector is the one of the outline, y up.
    const outline = font4e01.glyphs
      .get(font4e01.charToGlyphIndex(String.fromCodePoint(run[1])))
      .getPath(0, 0, font4e01.unitsPerEm)
      .getBoundingBox();
    const boxRow = await app.page.evaluate(
      () =>
        [...document.querySelectorAll(".inspector dt")].find(
          (dt) => dt.textContent === "Bounding box",
        )?.nextElementSibling?.textContent ?? "",
    );
    const boxNumbers = (boxRow.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const wanted = [outline.x1, outline.x2, -outline.y2, -outline.y1];
    check(
      "The inspector gives the bounding box as the outline has it (x, y up)",
      boxNumbers.length === 4 &&
        wanted.every((n, i) => Math.abs(n - boxNumbers[i]) < 0.01),
      `${boxRow} vs ${wanted.join(", ")}`,
    );

    // How many points the inspector counts, against the points the font file
    // stores: the contours and off-curve points are the same, and the on-curve
    // ones are the stored ones plus those left out between two off-curve points.
    const stored = font4e01.glyphs.get(
      font4e01.charToGlyphIndex(String.fromCodePoint(run[1])),
    );
    const storedPath = stored.getPath();
    let contours = 0;
    let off = 0;
    let on = 0;
    if (font4e01.tables.glyf) {
      // TrueType: the points as stored
      for (const contour of stored.getContours() as unknown as {
        onCurve: boolean;
      }[][]) {
        contours++;
        contour.forEach((point, i) => {
          const next = contour[(i + 1) % contour.length];
          if (point.onCurve) on++;
          else {
            off++;
            if (!next.onCurve) on++;
          }
        });
      }
    } else {
      // CFF stores no points, only path operators: M/L/Q/C end on-curve, Q has
      // one off-curve point and C two.
      for (const c of storedPath.commands) {
        if (c.type === "M") contours++;
        if (c.type !== "Z") on++;
        if (c.type === "Q") off++;
        if (c.type === "C") off += 2;
      }
    }
    const countsRow = await app.page.evaluate(() => {
      const rows: Record<string, string | undefined> = {};
      for (const dt of document.querySelectorAll(".inspector dt"))
        rows[dt.textContent ?? ""] = dt.nextElementSibling?.textContent;
      return rows;
    });
    check(
      "The inspector counts contours and points as the font file stores them",
      countsRow.Contours === String(contours) &&
        countsRow.Points === `${on + off} ${on} on · ${off} off`,
      `${countsRow.Contours} / ${countsRow.Points} vs ${contours} / ${on + off} · ${on} on · ${off} off`,
    );

    await app.page.mouse.move(
      area.x + area.width / 2,
      area.y + area.height / 2,
    );
    await app.page.mouse.wheel(0, -300);
    await app.page.waitForTimeout(250);
    const zoomed = Number.parseFloat(await label());
    shown = await ink();
    check(
      "The wheel zooms in; the zoom is shown and Fit becomes available",
      zoomed > 1.3 &&
        !(await app.page.$eval(
          ".zoom-fit",
          (b) => (b as HTMLButtonElement).disabled,
        )),
      await label(),
    );
    const grown = (shown.x2 - shown.x1 + 1) / shown.ratio;
    check(
      "The glyph grew by the zoom shown",
      Math.abs(grown / width - zoomed) < 0.15 * zoomed || shown.x1 <= 0,
      `${(grown / width).toFixed(2)} vs ${zoomed}`,
    );

    const moved0 = await ink();
    await app.page.mouse.down();
    await app.page.mouse.move(
      area.x + area.width / 2 + 60,
      area.y + area.height / 2 + 40,
      { steps: 4 },
    );
    await app.page.mouse.up();
    await app.page.waitForTimeout(200);
    const moved1 = await ink();
    const dx = (moved1.x1 - moved0.x1) / moved1.ratio;
    const dy = (moved1.y1 - moved0.y1) / moved1.ratio;
    check(
      "Dragging moves the glyph with the pointer",
      Math.abs(dx - 60) < 3 && Math.abs(dy - 40) < 3,
      `${dx.toFixed(1)}, ${dy.toFixed(1)}`,
    );

    await app.page.keyboard.press("ArrowRight");
    await app.page.waitForTimeout(250);
    check(
      "Right arrow shows the next glyph and keeps the zoom",
      (await app.inspector()).includes(U(run[2])) &&
        Number.parseFloat(await label()) === zoomed,
      await label(),
    );
    await app.page.keyboard.press("ControlOrMeta+0");
    await app.page.waitForTimeout(200);
    check(
      "Cmd/Ctrl+0 fits again",
      (await label()) === "1.0×" &&
        (await app.page.$eval(
          ".zoom-fit",
          (b) => (b as HTMLButtonElement).disabled,
        )),
    );
    // VS Code's webview forwards the keys that reach a listener on the window
    // of the page. The keys the zoom view uses must not get that far, or the
    // editor zooms its whole window with them.
    await app.page.evaluate(() => {
      window.seenKeys = [];
      window.addEventListener("keydown", (e) => {
        if (e.key !== "Meta" && e.key !== "Control")
          window.seenKeys.push(e.key);
      });
    });
    await app.page.keyboard.press("ControlOrMeta+=");
    await app.page.keyboard.press("ControlOrMeta+=");
    await app.page.waitForTimeout(200);
    check(
      "Cmd/Ctrl+= zooms in by steps (1.25 each)",
      Math.abs(Number.parseFloat(await label()) - 1.56) < 0.06,
      await label(),
    );
    await app.page.keyboard.press("ControlOrMeta+-");
    await app.page.waitForTimeout(200);
    check(
      "Cmd/Ctrl+- zooms out",
      Math.abs(Number.parseFloat(await label()) - 1.25) < 0.06,
      await label(),
    );
    await app.page.keyboard.press("ControlOrMeta+0");
    await app.page.keyboard.press("x");
    check(
      "The keys the zoom view uses stay inside it; the others go on to the page",
      (await app.page.evaluate(() => window.seenKeys.join())) === "x",
      await app.page.evaluate(() => window.seenKeys.join()),
    );
    await app.page.keyboard.press("ControlOrMeta+=");
    await app.page.mouse.dblclick(area.x + 80, area.y + 80);
    await app.page.waitForTimeout(200);
    check("Double-click fits", (await label()) === "1.0×");

    await app.page.keyboard.press("o");
    await app.page.waitForTimeout(150);
    check(
      "A layer key flips its switch in the inspector",
      (await app.page.$$eval(".layer-list input", (is) =>
        is.map((i) => (i as HTMLInputElement).checked).join(),
      )) === "true,true,false,true,false,false,false,true,false",
    );
    await app.page.keyboard.press("o");

    await app.page.keyboard.press("m");
    await app.page.waitForTimeout(150);
    check(
      "M switches the Metrics layer on, and the inspector lists the font's metrics",
      (await app.page.$$eval(".layer-list input", (is) =>
        is.map((i) => (i as HTMLInputElement).checked).join(),
      )) === "true,false,false,true,false,true,false,true,false" &&
        (await app.page.$$eval(".rows dt", (dts) =>
          dts.some((dt) => dt.textContent === "Typo metrics"),
        )),
    );
    await app.page.keyboard.press("m");

    // The on-curve points are squares in the selection color (#2563eb in the
    // dev page's light theme): none before the Points layer, plenty after.
    const accentPixels = () =>
      app.page.evaluate(() => {
        const canvas = document.querySelector(
          ".zoom canvas",
        ) as HTMLCanvasElement;
        const { data } = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height);
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (
            Math.abs(data[i] - 26) < 8 &&
            Math.abs(data[i + 1] - 133) < 8 &&
            Math.abs(data[i + 2] - 255) < 8
          )
            count++;
        }
        return count;
      });
    const withoutPoints = await accentPixels();
    await app.page.keyboard.press("p");
    await app.page.waitForTimeout(250);
    const withPoints = await accentPixels();
    check(
      "The P key shows the points: squares in the outline color appear",
      withoutPoints === 0 && withPoints >= on * 20,
      `${withoutPoints} -> ${withPoints} pixels for ${on} on-curve points`,
    );
    await app.page.keyboard.press("p");
    // Let the points go before the plain picture is taken: it is what the
    // checks below compare with, and a slow runner has not redrawn yet.
    await app.page.waitForTimeout(250);

    // The Bounding box layer draws a dashed box: the picture changes with B, and
    // is the same again when it is switched off.
    const picture = () =>
      app.page.$eval(".zoom canvas", (c) =>
        (c as HTMLCanvasElement).toDataURL(),
      );
    const plain = await picture();
    await app.page.keyboard.press("b");
    await app.page.waitForTimeout(250);
    const boxed = await picture();
    await app.page.keyboard.press("b");
    await app.page.waitForTimeout(250);
    check(
      "The B key draws the bounding box, and a second press takes it away",
      boxed !== plain && (await picture()) === plain,
    );

    // The Side bearings layer tints the space either side of the ink and names
    // it: the picture changes with S and is the same again when it is off.
    await app.page.keyboard.press("s");
    await app.page.waitForTimeout(250);
    const bearings = await picture();
    check(
      "The S key draws the side bearings, and a second press takes them away",
      bearings !== plain &&
        (await app.page.$$eval(
          ".layer-list input",
          (is) => (is[4] as HTMLInputElement).checked,
        )),
    );
    await app.page.keyboard.press("s");
    await app.page.waitForTimeout(250);
    check(
      "... and the picture is the plain one again",
      (await picture()) === plain,
    );

    // The overview in the corner: there while part of the glyph is out of view,
    // not while all of it is in view.
    const overviewShown = () =>
      app.page.$eval(".zoom-overview", (c) => !(c as HTMLElement).hidden);
    check(
      "No overview while the whole glyph is in view",
      !(await overviewShown()),
    );
    for (let i = 0; i < 4; i++) {
      await app.page.click('.zoom-bar button[aria-label="Zoom in"]');
    }
    await app.page.waitForTimeout(250);
    check(
      "The overview shows once the view is closer than the glyph",
      await overviewShown(),
    );
    // A click in its top left corner moves the view there: the picture changes.
    const beforeJump = await picture();
    const corner = await app.page.$eval(".zoom-overview", (c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left, y: r.top };
    });
    await app.page.mouse.click(corner.x + 8, corner.y + 8);
    await app.page.waitForTimeout(250);
    check(
      "A click on the overview moves the view, and the view keeps the keys",
      (await picture()) !== beforeJump &&
        (await app.page.evaluate(
          () =>
            document.activeElement?.classList.contains("zoom-surface") === true,
        )),
    );
    await app.page.click(".zoom-fit");
    await app.page.waitForTimeout(250);
    check("Fit takes the overview away", !(await overviewShown()));

    // The view may go out as far as a tenth of the fitted size.
    for (let i = 0; i < 14; i++) {
      await app.page.click('.zoom-bar button[aria-label="Zoom out"]');
    }
    await app.page.waitForTimeout(250);
    check(
      "Zooming out stops at 0.1×",
      (await label()) === "0.1×",
      await label(),
    );
    await app.page.click(".zoom-fit");
    await app.page.waitForTimeout(200);

    // The buttons of the bar do what the keys do, and leave the keys in the view.
    const zoomBefore = Number.parseFloat(await label());
    await app.page.click('.zoom-bar button[aria-label="Zoom in"]');
    await app.page.waitForTimeout(200);
    const zoomIn = Number.parseFloat(await label());
    await app.page.click('.zoom-bar button[aria-label="Zoom out"]');
    await app.page.waitForTimeout(200);
    const zoomOut = Number.parseFloat(await label());
    await app.page.click(".zoom-fit");
    await app.page.waitForTimeout(200);
    check(
      "The bar's + and − zoom by a step, Fit goes back to 1.0×, and the view keeps the keys",
      zoomIn > zoomBefore &&
        Math.abs(zoomOut - zoomBefore) < 0.01 &&
        (await label()) === "1.0×" &&
        (await app.page.evaluate(
          () =>
            document.activeElement?.classList.contains("zoom-surface") === true,
        )),
      `${zoomBefore} -> ${zoomIn} -> ${zoomOut}`,
    );

    await app.page.keyboard.press("Escape");
    await app.page.waitForTimeout(250);
    const after = await app.page.evaluate(() => ({
      top: document.getElementById("grid-viewport")!.scrollTop,
      focus: document.activeElement?.id,
      inert: (document.querySelector(".stage-grid") as HTMLInputElement).inert,
    }));
    check(
      "Escape goes back: the grid is where it was and has the keys",
      !(await zoomOpen()) &&
        after.top === before &&
        after.focus === "grid-viewport" &&
        !after.inert,
      JSON.stringify(after),
    );
    check(
      "The selection followed the arrow key in the grid",
      (await app.inspector()).includes(U(run[2])),
    );
    await app.page.keyboard.press("ArrowRight");
    await app.page.waitForTimeout(200);
    check(
      "The arrow keys move the grid's selection again",
      (await app.inspector()).includes(U(run[3])),
    );

    await app.clickCard(2);
    await app.page.mouse.dblclick(
      (await boxOf(app.page, "#grid-viewport")).x + 100,
      (await boxOf(app.page, "#grid-viewport")).y + 60,
    );
    await app.page.waitForTimeout(250);
    check("Double-clicking a card opens it", await zoomOpen());
    await app.pickBlock("Basic Latin (");
    check("Choosing another block closes the zoom view", !(await zoomOpen()));
    await app.page.close();
  } else skip("Zoom view", "Noto Sans TC missing");

  if (notoSerif) {
    // A CFF contour need not end where it began, and opentype.js writes no
    // closing command: the outline must still be closed. Find, in the font
    // itself, the CJK glyph whose contour ends furthest from where it began:
    // the edge between those two points is only there if the contour was closed.
    const probe = parseFont(FONTS.notoSerif);
    type Corner = { x: number; y: number };
    let gap = null as {
      cp: number;
      length: number;
      first: Corner;
      last: Corner;
    } | null;
    for (const cp of [...notoSerif.cmap.keys()]
      .filter((c) => c >= 0x4e00 && c <= 0x9fff)
      .sort((a, b) => a - b)
      .slice(0, 3000)) {
      const commands = probe.glyphs
        .get(notoSerif.cmap.get(cp) as number)
        .getPath(0, 0, probe.unitsPerEm).commands;
      let first = null as Corner | null;
      let last = null as Corner | null;
      const consider = () => {
        if (!first || !last) return;
        const length = Math.hypot(last.x - first.x, last.y - first.y);
        if (length > 1 && (!gap || length > gap.length)) {
          gap = { cp, length, first, last };
        }
      };
      for (const c of commands) {
        if (c.type === "M") {
          consider();
          first = { x: c.x, y: c.y };
          last = first;
        } else if (c.type === "Z") {
          last = first;
        } else {
          last = { x: c.x, y: c.y };
        }
      }
      consider();
    }
    if (!gap) throw new Error("no CFF glyph with an unclosed contour found");
    const gapChar = String.fromCodePoint(gap.cp);
    const app = await open(FONTS.notoSerif);
    await app.search(gapChar);
    await app.clickCard(0);
    await app.page.keyboard.press("Space");
    await app.page.waitForSelector(".zoom");
    await app.page.keyboard.press("f");
    await app.page.keyboard.press("o");
    await app.page.waitForTimeout(300);
    const font = parseFont(FONTS.notoSerif);
    const os2 = font.tables.os2;
    const ascender =
      os2.sTypoAscender > 0 && os2.sTypoAscender - os2.sTypoDescender > 0
        ? os2.sTypoAscender
        : font.ascender;
    const area = await boxOf(app.page, ".zoom-surface");
    const size = Math.min(area.width, area.height) * 0.76;
    const scale = size / font.unitsPerEm;
    const squareX = (area.width - size) / 2;
    const squareY = (area.height - size) / 2;
    const glyph = font.glyphs.get(font.charToGlyphIndex(gapChar));
    const originX =
      squareX + (size - (glyph.advanceWidth as number) * scale) / 2;
    const baselineY = squareY + ascender * scale;
    const edge = await app.page.evaluate(
      ([x, y]) => {
        const canvas = document.querySelector(
          ".zoom canvas",
        ) as HTMLCanvasElement;
        const ratio = canvas.width / canvas.clientWidth;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        let found = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const p = ctx.getImageData(
              Math.round(x * ratio) + dx,
              Math.round(y * ratio) + dy,
              1,
              1,
            ).data;
            // A 1 px line between two pixel rows is half blended with the
            // background, so test for "clearly blue", not for the exact colour.
            if (p[2] - p[0] > 40) found++;
          }
        }
        return found;
      },
      [
        originX + ((gap.first.x + gap.last.x) / 2) * scale,
        baselineY + ((gap.first.y + gap.last.y) / 2) * scale, // path y points down
      ],
    );
    check(
      "A CFF outline is closed: the edge from the last point back to the first is drawn",
      edge > 0,
      `${edge} outline pixels at the middle of that edge`,
    );
    await app.page.close();
  } else skip("CFF zoom view", "Noto Serif TC missing");

  if (notoSans) {
    // A cell of the "include missing" view has no glyph: the view says so.
    const app = await open(FONTS.notoSans);
    await app.pickBlock("CJK Unified Ideographs (");
    await app.pick(SHOW, "all");
    let first = 0x4e00;
    while (notoSans.cmap.has(first)) first++;
    await app.clickCard(first - 0x4e00);
    await app.page.keyboard.press("Space");
    await app.page.waitForSelector(".zoom");
    check(
      "A missing cell opens too, and says there is no glyph",
      (await app.inspector()).includes("Missing"),
    );
    await app.page.close();
  }
}
