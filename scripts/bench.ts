import "./use-repo-root.ts";
import { existsSync } from "node:fs";
import { type Browser, chromium } from "playwright";
import { createServer } from "vite";
import { FONTS as bench } from "./fixtures/fonts.ts";

const PORT = 5199;
const WARMUP_SECONDS = 5;
const MEASURE_SECONDS = 10;

const FONTS = {
  "Noto Sans TC": bench.notoSans,
  "Noto Serif TC (CFF)": bench.notoSerif,
};
const SPEEDS = [300, 30];

const STATS_RE =
  /renders\/s: (\d+)\s+avg: ([\d.]+) ms\s+max: ([\d.]+) ms\s+cache: (\d+)%/;

function summarize(samples: string[]) {
  const parsed = samples
    .map((s) => STATS_RE.exec(s))
    .filter((m): m is RegExpExecArray => m !== null);
  if (parsed.length === 0) return null;
  const nums = parsed.map((m) => m.slice(1).map(Number));
  const mean = (i: number) => nums.reduce((a, r) => a + r[i], 0) / nums.length;
  return {
    "renders/s": mean(0).toFixed(0),
    "avg ms": mean(1).toFixed(2),
    "max ms": Math.max(...nums.map((r) => r[2])).toFixed(2),
    "cache %": mean(3).toFixed(0),
    samples: nums.length,
  };
}

async function runOne(
  browser: Browser,
  url: string,
  fontPath: string,
  speed: number,
) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(url);
  await page.waitForSelector("input[type=file]");
  await page.setInputFiles("input[type=file]", fontPath);
  await page.waitForFunction(
    () =>
      Number.parseFloat(
        document.getElementById("grid-spacer")?.style.height ?? "",
      ) > 0,
    null,
    { timeout: 60000 },
  );

  await page.evaluate(
    ([s, px]) => window.autoScroll(s, px),
    [WARMUP_SECONDS, speed],
  );
  await page.waitForTimeout((WARMUP_SECONDS + 1) * 1000);

  await page.evaluate(() => {
    window.__log = [];
    const el = document.getElementById("stats") as HTMLElement;
    new MutationObserver(() => window.__log.push(el.textContent ?? "")).observe(
      el,
      {
        childList: true,
        characterData: true,
        subtree: true,
      },
    );
  });
  await page.evaluate(
    ([s, px]) => window.autoScroll(s, px),
    [MEASURE_SECONDS, speed],
  );
  await page.waitForTimeout((MEASURE_SECONDS + 1) * 1000);

  const log = await page.evaluate(() => window.__log);
  await page.close();
  return summarize(log.slice(1, -1));
}

const server = await createServer({
  server: { port: PORT, strictPort: true },
  logLevel: "error",
});
await server.listen();

const browser = await chromium.launch();
const rows: Record<string, unknown>[] = [];
try {
  for (const [fontName, fontPath] of Object.entries(FONTS)) {
    if (!existsSync(fontPath)) {
      console.error(`${fontPath} is missing: run pnpm fetch:fixtures`);
      process.exit(1);
    }
    for (const speed of SPEEDS) {
      const url = `http://localhost:${PORT}/`;
      process.stderr.write(`${fontName} | ${speed}px/frame ...\n`);
      const result = await runOne(browser, url, fontPath, speed);
      rows.push({
        font: fontName,
        "px/frame": speed,
        ...result,
      });
    }
  }
} finally {
  await browser.close();
  await server.close();
}

console.table(rows);
