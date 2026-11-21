// The colors of the glyph grid and the glyph preview.
//
// They are derived in CSS (`--glyph-*` in app/styles/tokens.css) from the variables the VS
// Code theme provides, so the grid belongs to whatever theme the user picked. A
// canvas cannot use CSS variables, so the colors are read out here, checked for
// contrast (core/palette.ts), and read again whenever the theme changes.

import {
  guardPalette,
  legibleOn,
  type PaletteInput,
  type Rgba,
} from "../core/palette.ts";

/** The colors to draw with, as CSS color strings a canvas accepts. */
export interface Palette {
  cardFill: string;
  labelFill: string;
  frameStroke: string;
  dividerStroke: string;
  baselineStroke: string;
  glyphFill: string;
  labelText: string;
  clippedMark: string;
  hoverFill: string;
  selectionStroke: string;
  outlineStroke: string;
  handleStroke: string;
  squareStroke: string;
  advanceStroke: string;
  boundsStroke: string;
  metricsStroke: string;
  blankStroke: string;
  missingFill: string;
  /** How each guide is dashed, as `setLineDash` takes it; empty is solid. */
  dashes: Record<GuideLine, number[]>;
}

/** The guides whose dash pattern is a style of the theme (`--glyph-dash-*`). */
export type GuideLine = "baseline" | "square" | "advance" | "bbox" | "metrics";
const GUIDE_LINES: readonly GuideLine[] = [
  "baseline",
  "square",
  "advance",
  "bbox",
  "metrics",
];
const DEFAULT_DASHES: Record<GuideLine, number[]> = {
  baseline: [],
  square: [],
  advance: [6, 3],
  bbox: [],
  metrics: [1, 3],
};

/** "3 3" is a dash of 3 and a gap of 3; "none" and "" are a solid line. */
function readDash(value: string, fallback: number[]): number[] {
  const text = value.trim();
  if (text === "") return fallback;
  if (text === "none") return [];
  const numbers = text.split(/\s+/).map(Number);
  return numbers.every((n) => Number.isFinite(n) && n >= 0)
    ? numbers
    : fallback;
}

const hex = (value: string): Rgba => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
  1,
];

// The light set, used for any variable that is missing or cannot be read.
const FALLBACK: PaletteInput = {
  cardFill: hex("#fcfcfd"),
  labelFill: hex("#f1f3f6"),
  frameStroke: hex("#b3bac6"),
  dividerStroke: hex("#e3e7ee"),
  glyphFill: hex("#14171f"),
  labelText: hex("#586070"),
  clippedMark: hex("#d64545"),
  selectionStroke: hex("#2563eb"),
  outlineStroke: hex("#1a85ff"),
  handleStroke: hex("#7ab2ff"),
  baselineStroke: hex("#4a4d55"),
  squareStroke: hex("#aab1be"),
  advanceStroke: hex("#652d90"),
  boundsStroke: hex("#388a34"),
  metricsStroke: hex("#8a91a0"),
  blankStroke: hex("#2563eb"),
  missingFill: hex("#e4e7ec"),
};

const VARIABLES: Record<keyof PaletteInput, string> = {
  cardFill: "--glyph-card-bg",
  labelFill: "--glyph-label-bg",
  frameStroke: "--glyph-frame",
  dividerStroke: "--glyph-divider",
  glyphFill: "--glyph-fill",
  labelText: "--glyph-label-text",
  clippedMark: "--glyph-clipped",
  selectionStroke: "--glyph-selection",
  outlineStroke: "--glyph-outline",
  handleStroke: "--glyph-handle",
  baselineStroke: "--glyph-baseline",
  squareStroke: "--glyph-square",
  advanceStroke: "--glyph-advance",
  boundsStroke: "--glyph-bounds",
  metricsStroke: "--glyph-metrics",
  blankStroke: "--glyph-blank",
  missingFill: "--glyph-missing",
};

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Turn any CSS color (a hex code, `color-mix(...)`, ...) into numbers by letting
 * the browser paint one pixel with it. null when the browser does not know it.
 */
function parseColor(css: string): Rgba | null {
  if (css === "" || !CSS.supports("color", css)) return null;
  if (probe === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

function css([r, g, b, a]: Rgba): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`;
}

/** The colors in effect for `element` (they are inherited from <body>). */
function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const input = { ...FALLBACK };
  for (const key of Object.keys(VARIABLES) as (keyof PaletteInput)[]) {
    const parsed = parseColor(style.getPropertyValue(VARIABLES[key]).trim());
    if (parsed) input[key] = parsed;
  }
  const g = guardPalette(input);
  return {
    cardFill: css(g.cardFill),
    labelFill: css(g.labelFill),
    frameStroke: css(g.frameStroke),
    dividerStroke: css(g.dividerStroke),
    baselineStroke: css(g.baselineStroke),
    glyphFill: css(g.glyphFill),
    labelText: css(g.labelText),
    clippedMark: css(g.clippedMark),
    hoverFill: css(g.hoverFill),
    selectionStroke: css(g.selectionStroke),
    outlineStroke: css(g.outlineStroke),
    handleStroke: css(g.handleStroke),
    squareStroke: css(g.squareStroke),
    advanceStroke: css(g.advanceStroke),
    boundsStroke: css(g.boundsStroke),
    metricsStroke: css(g.metricsStroke),
    blankStroke: css(g.blankStroke),
    missingFill: css(g.missingFill),
    dashes: Object.fromEntries(
      GUIDE_LINES.map((line) => [
        line,
        readDash(
          style.getPropertyValue(`--glyph-dash-${line}`),
          DEFAULT_DASHES[line],
        ),
      ]),
    ) as Record<GuideLine, number[]>,
  };
}

/** Contrast of text (WCAG AA), and of the marks that carry meaning (WCAG non-text). */
const TEXT_CONTRAST = 4.5;
const MARK_CONTRAST = 3;

/**
 * Colors the interface derives from the theme's own, kept readable (set on <body>):
 * - `--warning-text`: the warning color for words (Undrawn in the stats line),
 * - `--warning-mark`, `--drawn-mark`: the state colors for the swatches and bars,
 * - `--edge-guarded`: the edge of the Missing swatch and of the coverage bar,
 * - `--clipped-mark`: the Clipped triangle, as the grid draws it (not from the theme's raw color).
 * Each is the theme's color darkened (or lightened) toward the theme's text color
 * only as far as it takes, so a theme that is already readable is left alone, and
 * one whose own text is faint (Solarized Light) cannot be made better than that.
 */
function updateTextColors(element: HTMLElement, glyphs: Palette) {
  // The legend of the Clipped triangle is the very color the grid draws it in.
  element.style.setProperty("--clipped-mark", glyphs.clippedMark);
  const style = getComputedStyle(element);
  const read = (name: string) =>
    parseColor(style.getPropertyValue(name).trim());
  const background = read("--bg");
  const foreground = read("--fg");
  const names = [
    "--warning-text",
    "--warning-mark",
    "--drawn-mark",
    "--edge-guarded",
  ];
  if (!background || !foreground) {
    for (const name of names) element.style.removeProperty(name);
    return;
  }
  const page = legibleOn(background, [255, 255, 255, 1], foreground, 1);
  const set = (name: string, color: Rgba | null, minimum: number) => {
    if (!color) element.style.removeProperty(name);
    else
      element.style.setProperty(
        name,
        css(legibleOn(color, page, foreground, minimum)),
      );
  };
  const warning = read("--warning");
  set("--warning-text", warning, TEXT_CONTRAST);
  set("--warning-mark", warning, MARK_CONTRAST);
  set("--drawn-mark", read("--state-drawn"), MARK_CONTRAST);
  // 55% of the text color over the page, and no weaker than the marks need.
  const share = 0.55;
  const edge: Rgba = [
    foreground[0] * share + page[0] * (1 - share),
    foreground[1] * share + page[1] * (1 - share),
    foreground[2] * share + page[2] * (1 - share),
    1,
  ];
  set("--edge-guarded", edge, MARK_CONTRAST);
}

/**
 * Call `onChange` after the theme changed. VS Code switches theme by changing
 * the class of <body> and the variables on <html>, so watch both; the callback
 * runs on the next frame, when the new styles are in effect.
 */
function watchTheme(onChange: () => void): () => void {
  let pending = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(onChange);
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => {
    cancelAnimationFrame(pending);
    observer.disconnect();
  };
}

// The palette is read once and shared: the canvas grid and the React components
// both want it, and both must change when the theme does. It is an external
// store in the sense of React's useSyncExternalStore: `getPalette` returns the
// same object until the theme changes, and `subscribePalette` says when.
let palette: Palette | null = null;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;

/** The glyph colors for the current theme. */
export function getPalette(): Palette {
  if (!palette) {
    palette = readPalette(document.body);
    updateTextColors(document.body, palette);
  }
  return palette;
}

/** Call `listener` whenever the palette changed. Returns the way to stop. */
export function subscribePalette(listener: () => void): () => void {
  listeners.add(listener);
  stopWatching ??= watchTheme(() => {
    palette = readPalette(document.body);
    updateTextColors(document.body, palette);
    for (const notify of [...listeners]) notify();
  });
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopWatching?.();
      stopWatching = null;
      // Nobody is watching: the next reader must not get an old palette.
      palette = null;
    }
  };
}
