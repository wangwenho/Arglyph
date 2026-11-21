// The Webview comes back to the screen it was on.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { FONTS } from "../fixtures/fonts.ts";
import {
  BLOCK,
  BLOCK_PANEL,
  browser,
  type Context,
  check,
  PORT,
  ROOT,
  SEARCH,
  SHOW,
  SWITCH,
  server,
  skip,
  watchErrors,
} from "./harness.ts";

export async function webview({ fonts: { latin } }: Context) {
  // ---- the webview comes back to the screen it was on ----------------------
  // VS Code rebuilds the page of a hidden panel and gives back what `setState`
  // kept. This runs the real webview entry (src/webview/main.ts) against a
  // stand-in for `acquireVsCodeApi` whose state survives a reload, and reloads
  // the page the way a hidden-then-shown panel is: the font is sent again, and
  // the screen has to be the one that was left.
  if (latin) {
    const bytes = [...readFileSync(path.join(ROOT, FONTS.latin))];
    const html = await server.transformIndexHtml(
      "/webview-harness.html",
      '<!doctype html><html><body><div id="root"></div>' +
        '<script type="module" src="/src/webview/main.ts"></script></body></html>',
    );
    const webview = async () => {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 760 },
      });
      // The page is not served by Vite, so its hot-reload socket cannot connect:
      // that is not an error of the app.
      watchErrors(page, "Webview", {
        ignore:
          /WebSocket connection|failed to connect to websocket|Failed to send error to Vite/i,
      });
      await page.route("**/webview-harness.html", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      );
      await page.addInitScript(() => {
        window.acquireVsCodeApi = () => ({
          postMessage() {},
          getState: () =>
            JSON.parse(sessionStorage.getItem("harness-state") ?? "null"),
          setState: (state: unknown) => {
            sessionStorage.setItem("harness-state", JSON.stringify(state));
            return state;
          },
        });
      });
      await page.goto(`http://localhost:${PORT}/webview-harness.html`);
      return { page };
    };
    const sendFont = async (page: Page) => {
      await page.evaluate((data) => {
        window.postMessage(
          {
            type: "font",
            name: "Lato.ttf",
            data: new Uint8Array(data).buffer,
          },
          "*",
        );
      }, bytes);
      // The search box is there once the font is, but hidden in the text view.
      await page.waitForSelector(SEARCH, {
        state: "attached",
        timeout: 60000,
      });
      await page.waitForTimeout(500);
    };
    // Long enough for the save (250 ms after the last change), then the page is
    // rebuilt and sent the font again.
    const hideAndShow = async (page: Page) => {
      await page.waitForTimeout(600);
      await page.reload();
      await sendFont(page);
    };
    const pressed = (page: Page, name: string) =>
      page.$eval(SWITCH(name), (b) => b.getAttribute("aria-pressed"));

    {
      const { page } = await webview();
      await sendFont(page);
      check(
        "Webview: a new panel starts in the grid",
        (await pressed(page, "Grid")) === "true" &&
          !(await page.$(".text-view")),
      );
      await page.click(SWITCH("Text"));
      await page.waitForSelector(".text-view");
      const before = await page.$eval(
        ".text-input",
        (e) => (e as HTMLInputElement).value,
      );
      await hideAndShow(page);
      check(
        "Webview: hidden and shown again, the text view is still the one shown",
        (await page.$(".text-view")) !== null &&
          (await pressed(page, "Text")) === "true",
      );
      check(
        "Webview: and its text is the one that was there, also when it is only the default sample",
        before.length > 0 &&
          (await page.$eval(
            ".text-input",
            (e) => (e as HTMLInputElement).value,
          )) === before,
        `${JSON.stringify(before.slice(0, 12))}`,
      );
      await page.click(SWITCH("Grid"));
      await hideAndShow(page);
      check(
        "Webview: back in the grid, that is what comes back",
        (await pressed(page, "Grid")) === "true" &&
          !(await page.$(".text-view")),
      );
      await page.close();
    }

    {
      // The file went away: the toolbar says so and keeps saying it (a state),
      // until the file is readable again.
      const { page } = await webview();
      await sendFont(page);
      // No element at all when there is no notice.
      const notice = () =>
        page.evaluate(() => {
          const e = document.querySelector(".toolbar-notice");
          return {
            visible: e?.getAttribute("data-visible") === "true",
            text: e?.textContent ?? "",
          };
        });
      const state = (readable: boolean) =>
        page.evaluate((readable) => {
          window.postMessage({ type: "file-state", readable }, "*");
        }, readable);
      await state(false);
      await page.waitForTimeout(300);
      const gone = await notice();
      check(
        "Webview: a file that cannot be read is said so, with the last version still shown",
        gone.visible &&
          gone.text.includes("showing the last version") &&
          (await page.$("canvas")) !== null,
        JSON.stringify(gone),
      );
      // Longer than the 8 s an error notice stays for.
      await page.waitForTimeout(8600);
      check("... and it stays", (await notice()).visible);
      await state(true);
      await page.waitForTimeout(600);
      check("... until the file can be read again", !(await notice()).visible);
      await page.close();
    }

    {
      // What the grid was narrowed down to: the block, Show and the search
      const { page } = await webview();
      await sendFont(page);
      await page.click(BLOCK);
      await page.waitForSelector(BLOCK_PANEL);
      await page
        .locator(`${BLOCK_PANEL} [role=option]`)
        .filter({ hasText: "Latin-1 Supplement" })
        .first()
        .click();
      await page.waitForTimeout(350);
      await page.click(SHOW);
      await page.waitForSelector(BLOCK_PANEL);
      await page.click(`${BLOCK_PANEL} [role=option][data-value="drawn"]`);
      await page.waitForTimeout(350);
      await page.fill(SEARCH, "é");
      await page.waitForTimeout(350);
      const narrowed = async () => ({
        block: await page.$eval(BLOCK, (e) => e.textContent),
        show: await page.$eval(SHOW, (e) => e.textContent),
        search: await page.$eval(SEARCH, (e) => (e as HTMLInputElement).value),
        stats: await page.$eval(".stats", (e) => e.textContent),
      });
      const before = await narrowed();
      await hideAndShow(page);
      const after = await narrowed();
      check(
        "Webview: hidden and shown again, the block, Show and the search are as they were",
        before.block.includes("Latin-1 Supplement") &&
          before.search === "é" &&
          JSON.stringify(after) === JSON.stringify(before),
        `${JSON.stringify(before)} vs ${JSON.stringify(after)}`,
      );
      await page.close();
    }

    {
      // The inspector, left closed or open by the user
      const { page } = await webview();
      await sendFont(page);
      const open = () => page.$(".inspector");
      const wasOpen = (await open()) !== null;
      await page.click('button[aria-label="Toggle inspector"]');
      await page.waitForTimeout(200);
      const toggled = (await open()) !== null;
      await hideAndShow(page);
      check(
        "Webview: the inspector is left as the user set it",
        toggled !== wasOpen && ((await open()) !== null) === toggled,
        `${wasOpen} -> ${toggled} -> ${(await open()) !== null}`,
      );
      await page.click('button[aria-label="Toggle inspector"]');
      await hideAndShow(page);
      check(
        "... and toggled back, that is what comes back",
        ((await open()) !== null) === wasOpen,
      );
      await page.close();
    }

    {
      // The zoom view over the grid
      const { page } = await webview();
      await sendFont(page);
      await page.mouse.click(60, 140);
      await page.waitForTimeout(200);
      await page.keyboard.press("Space");
      await page.waitForSelector(".zoom");
      const glyph = await page.$eval(".inspector", (e) => e.textContent ?? "");
      await hideAndShow(page);
      await page.waitForSelector(".zoom", { timeout: 5000 }).catch(() => {});
      check(
        "Webview: hidden and shown again, the zoom view is still open",
        (await page.$(".zoom")) !== null,
      );
      check(
        "Webview: on the same glyph",
        (await page.$eval(".inspector", (e) => e.textContent ?? "")) === glyph,
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await hideAndShow(page);
      check(
        "Webview: closed, it stays closed",
        (await page.$(".zoom")) === null,
      );
      await page.close();
    }

    {
      // The zoom view over a character of the text
      const { page } = await webview();
      await sendFont(page);
      await page.click(SWITCH("Text"));
      await page.waitForSelector(".text-view");
      // The font is Latin only: give it text it has (the sample is Chinese).
      await page.fill(".text-input", "ABCDE");
      await page.focus(".text-input");
      await page.keyboard.press("ControlOrMeta+Home");
      await page.keyboard.press("ControlOrMeta+Enter");
      await page.waitForSelector(".zoom");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      const glyph = await page.$eval(".inspector", (e) => e.textContent ?? "");
      await hideAndShow(page);
      await page.waitForSelector(".zoom", { timeout: 5000 }).catch(() => {});
      check(
        "Webview: the zoom view over the text is still open, on the same character",
        (await page.$(".zoom")) !== null &&
          (await page.$(".text-view")) !== null &&
          (await page.$eval(".inspector", (e) => e.textContent ?? "")) ===
            glyph,
      );
      await page.close();
    }
  } else skip("Webview mode", "Lato missing");
}
