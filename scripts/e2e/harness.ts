// The shared half of the end-to-end checks: the Vite server and the browser,
// `open`/`load` for a page with a font in it, `check`/`skip` for the report,
// the selectors every section uses, and the font readers that compute the
// expected numbers from the font file (opentype.js), never from the app.

import { readFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import { type Browser, chromium, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { codepointKind } from "../../src/core/unicode/categories.ts";
import { FONTS } from "../fixtures/fonts.ts";
import { writeSynthesizedFont } from "../fixtures/synthetic-fonts.ts";

export const PORT = 5188;
export const ROOT = process.cwd();

// ---- the font files, read the slow and certain way -------------------------

/** What a section knows about a font file, worked out from the file alone. */
export interface FontFacts {
  file: string;
  /** Code point -> glyph index. */
  cmap: Map<number, number>;
  /** Whether glyph `glyph` has no outline. */
  empty(glyph: number): boolean;
  glyphCount: number;
}

/** The fonts the sections use; one that is not there is null and its checks skip. */
export interface Fonts {
  synthesized: FontFacts | null;
  notoSans: FontFacts | null;
  notoSerif: FontFacts | null;
  latin: FontFacts | null;
}

/** What `pnpm e2e` hands to every section. */
export interface Context {
  fonts: Fonts;
}

/** The font itself, for the numbers the checks take from its outlines. */
export function parseFont(file: string): opentype.Font {
  const buffer = readFileSync(path.join(ROOT, file));
  return opentype.parse(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer,
  );
}

export function readFont(file: string | undefined): FontFacts | null {
  if (!file) return null;
  let font: opentype.Font;
  try {
    font = parseFont(file);
  } catch {
    return null;
  }
  const cmap = new Map(
    Object.entries(
      font.tables.cmap.glyphIndexMap as Record<string, number>,
    ).map(([cp, g]) => [Number(cp), g]),
  );
  const empty = (glyph: number) =>
    font.glyphs.get(glyph).getPath().commands.length === 0;
  return { file, cmap, empty, glyphCount: font.glyphs.length };
}

export const U = (n: number) =>
  `U+${n.toString(16).toUpperCase().padStart(4, "0")}`;
export const N = (n: number) => n.toLocaleString("en-US");
export const inRange = (lo: number, hi: number) => (cp: number) =>
  cp >= lo && cp <= hi;

/** Glyphs that no code point maps to and that do have an outline: they count as Drawn in the whole-font numbers. */
export function unmappedDrawn(font: FontFacts): number {
  const mapped = new Set(font.cmap.values());
  let count = 0;
  for (let glyph = 0; glyph < font.glyphCount; glyph++) {
    if (!mapped.has(glyph) && !font.empty(glyph)) count++;
  }
  return count;
}

/** How many of the font's code points in `where` are in each state (by the rules of core/glyph/state.ts). */
export function tally(
  font: FontFacts,
  where: (cp: number) => boolean = () => true,
) {
  const t = { drawn: 0, blank: 0, undrawn: 0 };
  for (const [cp, glyph] of font.cmap) {
    if (!where(cp)) continue;
    if (!font.empty(glyph)) t.drawn++;
    else t[codepointKind(cp) === "ink" ? "undrawn" : "blank"]++;
  }
  return t;
}

// ---- the page --------------------------------------------------------------

export const BLOCK = 'button[aria-label="Unicode block"]';
export const BLOCK_PANEL = ".picker-popup";
export const SHOW = 'button[aria-label="Show"]';
export const SEARCH = 'input[aria-label="Search by character or code point"]';
export const TEXT = 'textarea[aria-label="Text to try in the font"]';
export const SWITCH = (name: string) => `.segmented button:text-is("${name}")`;

let failures = 0;
let skipped = 0;
export function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
}
// A font that is missing skips its checks on a machine of somebody who did not
// fetch it. On CI that is a run that tested less than it says: it fails.
export function skip(name: string, why: string): void {
  if (process.env.CI) {
    failures++;
    console.log(
      `FAIL  ${name}  (${why}; a missing font fails on CI: pnpm fetch:fixtures)`,
    );
    return;
  }
  skipped++;
  console.log(`SKIP  ${name}  (${why})`);
}

// Every page the sections open is watched for errors (an uncaught exception, a
// console.error): one check at the end says none had any, or names the page that did,
// so a section does not have to look.
const watched: { label: string; errors: string[] }[] = [];
export function watchErrors(
  page: Page,
  label: string,
  { ignore }: { ignore?: RegExp } = {},
): string[] {
  const errors: string[] = [];
  watched.push({ label, errors });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on(
    "console",
    (m) =>
      m.type() === "error" && !ignore?.test(m.text()) && errors.push(m.text()),
  );
  return errors;
}

/** The last line, and the process exit code. */
export function summary(): number {
  for (const { label, errors } of watched) {
    if (errors.length > 0)
      check(`No page errors (${label})`, false, errors.join(" | "));
  }
  check(
    `No page errors on any of the ${watched.length} pages the checks opened`,
    watched.every((w) => w.errors.length === 0),
  );
  console.log(
    `\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}${skipped ? `, ${skipped} skipped` : ""}`,
  );
  return failures === 0 ? 0 : 1;
}

// The server and the browser the sections drive (live bindings: set by start).
export let server!: ViteDevServer;
export let browser!: Browser;

export async function start(): Promise<void> {
  server = await createServer({
    server: { port: PORT, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch();
}

export async function stop(): Promise<void> {
  await browser.close();
  await server.close();
}

/** The font files the sections need; a missing one is null and its sections skip. */
export function loadFonts(): Fonts {
  // The synthetic font is made here, every time: it is fast, and the test never
  // runs against an old one.
  writeSynthesizedFont(FONTS.synthesized);
  return {
    synthesized: readFont(FONTS.synthesized),
    notoSans: readFont(FONTS.notoSans),
    notoSerif: readFont(FONTS.notoSerif),
    latin: readFont(FONTS.latin),
  };
}

/** One entry of a dropdown, as the page shows it. */
export interface PickerOption {
  value: string;
  text: string;
  disabled: boolean;
}

/** The grid at the default size: columns, card size and card height with its label. */
export interface GridLayout {
  cols: number;
  size: number;
  cell: number;
}

type ClickOptions = Parameters<Page["mouse"]["click"]>[2];

/** A page with a font in it, and what the sections do with it. */
export interface App {
  page: Page;
  errors: string[];
  stats(): Promise<string>;
  inspector(): Promise<string>;
  /** The height of the grid's scroll spacer, in px. */
  spacer(): Promise<number>;
  value(selector: string): Promise<string>;
  /** Open the block panel (it stays open until something is picked). */
  openBlocks(selector?: string): Promise<void>;
  closeBlocks(): Promise<void>;
  options(selector: string): Promise<PickerOption[]>;
  search(text: string): Promise<void>;
  pick(selector: string, value: string): Promise<void>;
  /** Pick the block whose label starts with `prefix`. */
  pickBlock(prefix: string): Promise<void>;
  /** The layout the grid uses at the default size (see computeCardLayout). */
  layout(): Promise<GridLayout>;
  clickCard(index: number, options?: ClickOptions): Promise<void>;
}

/** A fresh page with `file` loaded. */
export async function open(
  file: string,
  { width = 1200, height = 760 }: { width?: number; height?: number } = {},
): Promise<App> {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = watchErrors(page, path.basename(file));
  await page.goto(`http://localhost:${PORT}/?inspector=1`);
  await page.waitForSelector("input[type=file]");
  await load(page, file);
  const app: App = {
    page,
    errors,
    stats: () => page.$eval(".stats", (e) => e.textContent ?? ""),
    inspector: () => page.$eval(".inspector", (e) => e.textContent ?? ""),
    spacer: () =>
      page.evaluate(() =>
        Number.parseFloat(
          document.getElementById("grid-spacer")?.style.height ?? "",
        ),
      ),
    value: (selector) =>
      page.$eval(
        selector,
        (e) =>
          (e as HTMLElement).dataset.value ?? (e as HTMLInputElement).value,
      ),
    openBlocks: async (selector = BLOCK) => {
      if (!(await page.$(BLOCK_PANEL))) await page.click(selector);
      await page.waitForSelector(BLOCK_PANEL);
    },
    closeBlocks: async () => {
      if (await page.$(BLOCK_PANEL)) await page.keyboard.press("Escape");
    },
    options: async (selector) => {
      if (selector === BLOCK || selector === SHOW) {
        await app.openBlocks(selector);
        const list = await page.$$eval(`${BLOCK_PANEL} [role=option]`, (os) =>
          os.map((o) => ({
            value: (o as HTMLElement).dataset.value ?? "",
            text: (o as HTMLElement).dataset.label ?? "",
            disabled: o.getAttribute("aria-disabled") === "true",
          })),
        );
        await app.closeBlocks();
        return list;
      }
      return page.$$eval(`${selector} option`, (os) =>
        os.map((o) => ({
          value: (o as HTMLOptionElement).value,
          text: o.textContent ?? "",
          disabled: (o as HTMLOptionElement).disabled,
        })),
      );
    },
    search: async (text) => {
      await page.fill(SEARCH, text);
      await page.waitForTimeout(300);
    },
    pick: async (selector, value) => {
      if (selector === BLOCK || selector === SHOW) {
        await app.openBlocks(selector);
        await page.click(`${BLOCK_PANEL} [role=option][data-value="${value}"]`);
      } else {
        await page.selectOption(selector, value);
      }
      await page.waitForTimeout(350);
    },
    pickBlock: async (prefix) => {
      await app.openBlocks();
      // Typing in the filter shows the block, whatever plane it is in.
      await page.fill(".picker-search", prefix.replace(/ \($/, ""));
      await page
        .locator(`${BLOCK_PANEL} [role=option]:visible`)
        .filter({ has: page.locator(`text="${prefix.replace(/ \($/, "")}"`) })
        .first()
        .click();
      await page.waitForTimeout(350);
    },
    layout: () =>
      page.evaluate(() => {
        const width =
          document.getElementById("grid-viewport")?.clientWidth ?? 0;
        const cols = Math.floor((width - 1) / 72);
        const size = Math.floor((width - 1) / cols);
        return { cols, size, cell: size + Math.floor(size / 3) };
      }),
    clickCard: async (index, options = {}) => {
      const { cols, size, cell } = await app.layout();
      await page.evaluate(
        (top) => {
          const viewport = document.getElementById("grid-viewport");
          if (viewport) viewport.scrollTop = top;
        },
        Math.floor(index / cols) * cell,
      );
      await page.waitForTimeout(200);
      const box = await boxOf(page, "#grid-viewport");
      await page.mouse.click(
        box.x + 1 + (index % cols) * size + size / 2,
        box.y + 1 + Math.floor(size / 3) + size / 2,
        options,
      );
      await page.waitForTimeout(200);
    },
  };
  return app;
}

export async function load(page: Page, file: string): Promise<void> {
  await page.setInputFiles("input[type=file]", path.join(ROOT, file));
  await page.waitForSelector(SEARCH, { timeout: 60000 });
  await page.waitForFunction(
    () =>
      Number.parseFloat(
        document.getElementById("grid-spacer")?.style.height ?? "",
      ) > 0,
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(300);
}

/** Where the element `selector` is on the page; one that is not there is a failure. */
export async function boxOf(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box on the page`);
  return box;
}

/** Set the text of the box the way typing does, and let the page catch up. */
export const typeText = async (app: App, text: string): Promise<void> => {
  await app.page.fill(TEXT, text);
  await app.page.waitForTimeout(250);
};
export const marks = (app: App, kind: string) =>
  app.page.$$eval(`.text-mark-${kind}`, (els) =>
    els.map((e) => ({ text: e.textContent })),
  );
