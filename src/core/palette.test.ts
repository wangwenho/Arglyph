import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  ensureContrast,
  guardPalette,
  legibleOn,
  type PaletteInput,
  type Rgba,
} from "./palette.ts";

const hex = (value: string): Rgba => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
  1,
];
const BLACK = hex("#000000");
const WHITE = hex("#ffffff");

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a color on itself", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(hex("#777777"), hex("#777777"))).toBeCloseTo(1, 5);
  });

  it("matches known values (#767676 on white is the classic 4.5:1)", () => {
    expect(contrastRatio(hex("#767676"), WHITE)).toBeCloseTo(4.54, 1);
  });

  it("paints a translucent foreground over the background first", () => {
    // 50% black over white is mid gray, not black
    const half = contrastRatio([0, 0, 0, 0.5], WHITE);
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(contrastRatio(BLACK, WHITE));
    expect(contrastRatio([0, 0, 0, 0], WHITE)).toBeCloseTo(1, 5);
  });
});

describe("ensureContrast", () => {
  const card = hex("#1a1a1a");

  it("uses the first alternative that reaches the minimum", () => {
    const dim = hex("#555555");
    const alt = hex("#e0e0e0");
    expect(ensureContrast(dim, card, 7, [hex("#666666"), alt])).toBe(alt);
  });

  it("falls back to black or white, whichever contrasts more", () => {
    const mid = hex("#808080");
    expect(ensureContrast(mid, mid, 7, [mid])).toEqual(BLACK);
    expect(ensureContrast(hex("#404040"), hex("#404040"), 7, [])).toEqual(
      WHITE,
    );
  });
});

// A dark theme in the manner of VS Code's own
const dark: PaletteInput = {
  cardFill: hex("#1a1a1a"),
  labelFill: hex("#252525"),
  frameStroke: hex("#4a4a4a"),
  dividerStroke: hex("#2d2d2d"),
  glyphFill: hex("#cccccc"),
  labelText: hex("#a9a9a9"),
  clippedMark: hex("#cca700"),
  selectionStroke: hex("#0078d4"),
  outlineStroke: hex("#3794ff"),
  handleStroke: hex("#b180d7"),
  baselineStroke: hex("#7a7a7a"),
  squareStroke: hex("#5a5a5a"),
  advanceStroke: hex("#d6a14a"),
  boundsStroke: hex("#4cc9a7"),
  metricsStroke: hex("#7a7a7a"),
  blankStroke: hex("#3794ff"),
  missingFill: hex("#333333"),
};

describe("guardPalette", () => {
  it("keeps a theme whose colors are readable exactly as given", () => {
    const palette = guardPalette(dark);

    expect(palette.glyphFill).toEqual(dark.glyphFill);
    expect(palette.labelText).toEqual(dark.labelText);
    expect(palette.selectionStroke).toEqual(dark.selectionStroke);
    expect(palette.frameStroke).toEqual(dark.frameStroke);
    expect(palette.clippedMark).toEqual(dark.clippedMark);
  });

  it("replaces glyph ink that is too dim for the card (Solarized dark: 4.1:1)", () => {
    const palette = guardPalette({
      ...dark,
      cardFill: hex("#002b36"),
      labelFill: hex("#073642"),
      glyphFill: hex("#839496"),
    });

    expect(
      contrastRatio(palette.glyphFill, palette.cardFill),
    ).toBeGreaterThanOrEqual(7);
    expect(palette.glyphFill).not.toEqual(hex("#839496"));
  });

  it("puts dark ink on a light card and light ink on a dark one", () => {
    const light = guardPalette({
      ...dark,
      cardFill: hex("#fdf6e3"),
      labelFill: hex("#eee8d5"),
      glyphFill: hex("#fdf6e3"), // unreadable on purpose
    });
    const night = guardPalette({ ...dark, glyphFill: hex("#1a1a1a") });

    // Dark ink is nearer to black than to white, and light ink the other way.
    expect(contrastRatio(light.glyphFill, BLACK)).toBeLessThan(
      contrastRatio(light.glyphFill, WHITE),
    );
    expect(contrastRatio(night.glyphFill, WHITE)).toBeLessThan(
      contrastRatio(night.glyphFill, BLACK),
    );
  });

  it("replaces label text, selection and warning colors that do not stand out", () => {
    const text = guardPalette({ ...dark, labelText: hex("#3a3a3a") });
    expect(
      contrastRatio(text.labelText, text.labelFill),
    ).toBeGreaterThanOrEqual(4.5);
    const selection = guardPalette({
      ...dark,
      selectionStroke: hex("#222222"),
    });
    expect(
      contrastRatio(selection.selectionStroke, selection.cardFill),
    ).toBeGreaterThanOrEqual(3);
    const warning = guardPalette({ ...dark, clippedMark: hex("#262626") });
    expect(
      contrastRatio(warning.clippedMark, warning.labelFill),
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps the frame visible even when the theme makes it vanish", () => {
    const palette = guardPalette({ ...dark, frameStroke: dark.cardFill });
    expect(
      contrastRatio(palette.frameStroke, palette.cardFill),
    ).toBeGreaterThanOrEqual(1.5);
  });

  it("makes the hover tint from the final selection color", () => {
    const kept = guardPalette(dark);
    expect(kept.hoverFill.slice(0, 3)).toEqual(
      kept.selectionStroke.slice(0, 3),
    );
    expect(kept.hoverFill[3]).toBeLessThan(0.3);

    const replaced = guardPalette({ ...dark, selectionStroke: hex("#222222") });
    expect(replaced.hoverFill.slice(0, 3)).toEqual(
      replaced.selectionStroke.slice(0, 3),
    );
    expect(replaced.hoverFill.slice(0, 3)).not.toEqual([0x22, 0x22, 0x22]);
  });

  it("mixes a geometry or baseline color that is too faint toward the ink, keeping its hue", () => {
    const faint = hex("#2a2a45");
    const palette = guardPalette({
      ...dark,
      outlineStroke: faint,
      handleStroke: faint,
      baselineStroke: faint,
    });
    expect(
      contrastRatio(palette.outlineStroke, palette.cardFill),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(palette.handleStroke, palette.cardFill),
    ).toBeGreaterThanOrEqual(1.5);
    expect(
      contrastRatio(palette.baselineStroke, palette.cardFill),
    ).toBeGreaterThanOrEqual(1.5);
    // Blue stays bluer than red.
    expect(palette.outlineStroke[2]).toBeGreaterThan(palette.outlineStroke[0]);
  });

  it("copes with a translucent card by showing it over white", () => {
    const palette = guardPalette({ ...dark, cardFill: [0, 0, 0, 0] });
    expect(palette.cardFill).toEqual([255, 255, 255, 1]);
    expect(
      contrastRatio(palette.glyphFill, palette.cardFill),
    ).toBeGreaterThanOrEqual(7);
  });

  it("always ends with readable ink, even for a mid-gray card", () => {
    const gray = hex("#808080");
    const palette = guardPalette({
      ...dark,
      cardFill: gray,
      labelFill: gray,
      glyphFill: gray,
      labelText: gray,
    });
    expect(
      contrastRatio(palette.glyphFill, palette.cardFill),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("legibleOn", () => {
  const warning = hex("#bf8803");
  const text = hex("#3b3b3b");

  it("keeps a color that is readable already", () => {
    const dark = hex("#1f1f1f");
    const light = hex("#cca700");
    expect(legibleOn(light, dark, hex("#cccccc"), 4.5)).toEqual(light);
  });

  it("darkens a warning color toward the text color until it reaches the ratio", () => {
    const result = legibleOn(warning, WHITE, text, 4.5);
    expect(contrastRatio(result, WHITE)).toBeGreaterThanOrEqual(4.5);
    // As little as it takes: not the text color itself.
    expect(result).not.toEqual(text);
    // Still warm: red above blue.
    expect(result[0]).toBeGreaterThan(result[2]);
  });

  it("goes as far toward the text color as a very pale color needs", () => {
    const pale = hex("#f5f5f5");
    const result = legibleOn(pale, WHITE, BLACK, 4.5);
    expect(contrastRatio(result, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(result[0]).toBeGreaterThan(0);
  });
});
