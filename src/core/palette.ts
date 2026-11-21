// Contrast protection for the glyph colors.
//
// The glyph grid takes its colors from the VS Code theme (editor background and
// foreground, focus border, warning color, see app/styles/tokens.css), so it looks like
// part of whatever theme the user picked. Some themes are low-contrast or
// unusual, though, and a font previewer must always show its glyphs clearly. So
// the colors the theme gives are checked against WCAG contrast ratios and
// replaced by safe ones when they do not reach them.
//
// Everything here works on plain numbers, so it can be tested without a browser.

/** Red, green, blue (0-255) and alpha (0-1). */
export type Rgba = readonly [number, number, number, number];

/** WCAG 2 relative luminance, 0 (black) to 1 (white). Ignores alpha. */
function relativeLuminance(color: Rgba): number {
  const linear = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear(color[0]) +
    0.7152 * linear(color[1]) +
    0.0722 * linear(color[2])
  );
}

/** `color` painted over the opaque `over`: what the eye sees. */
function flatten(color: Rgba, over: Rgba): Rgba {
  const a = color[3];
  return [
    color[0] * a + over[0] * (1 - a),
    color[1] * a + over[1] * (1 - a),
    color[2] * a + over[2] * (1 - a),
    1,
  ];
}

/**
 * WCAG contrast ratio of `foreground` on the opaque `background`, 1 to 21. A
 * translucent foreground is first painted over the background.
 */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const shown = relativeLuminance(flatten(foreground, background));
  const base = relativeLuminance(background);
  const [lighter, darker] = shown > base ? [shown, base] : [base, shown];
  return (lighter + 0.05) / (darker + 0.05);
}

function withAlpha(color: Rgba, alpha: number): Rgba {
  return [color[0], color[1], color[2], alpha];
}

/** Whether a background is dark enough that light ink belongs on it. */
function isDark(background: Rgba): boolean {
  return relativeLuminance(background) < 0.179;
}

/**
 * `color` if it reaches the contrast `minimum` on `background`; otherwise the
 * first of `alternatives` that does; otherwise black or white, whichever
 * contrasts more.
 */
export function ensureContrast(
  color: Rgba,
  background: Rgba,
  minimum: number,
  alternatives: readonly Rgba[],
): Rgba {
  if (contrastRatio(color, background) >= minimum) return color;
  for (const alternative of alternatives) {
    if (contrastRatio(alternative, background) >= minimum) return alternative;
  }
  const black: Rgba = [0, 0, 0, 1];
  const white: Rgba = [255, 255, 255, 1];
  return contrastRatio(black, background) >= contrastRatio(white, background)
    ? black
    : white;
}

/**
 * `color` made readable as text on `background` (`minimum` is a contrast ratio):
 * itself when it already is, otherwise mixed with `foreground` (the theme's own
 * text color) in steps of 5% until it is, so that it stays the same hue family as
 * far as it can. Mixing is why this beats swapping in a fixed color: a theme's
 * warning color is kept, only darkened (or lightened) as much as it must be.
 */
export function legibleOn(
  color: Rgba,
  background: Rgba,
  foreground: Rgba,
  minimum: number,
): Rgba {
  const base = flatten(color, background);
  if (contrastRatio(base, background) >= minimum) return base;
  for (let share = 0.05; share <= 1.0001; share += 0.05) {
    const mixed: Rgba = [
      base[0] * (1 - share) + foreground[0] * share,
      base[1] * (1 - share) + foreground[1] * share,
      base[2] * (1 - share) + foreground[2] * share,
      1,
    ];
    if (contrastRatio(mixed, background) >= minimum) return mixed;
  }
  return flatten(foreground, background);
}

/** The colors the theme provides. */
export interface PaletteInput {
  cardFill: Rgba;
  labelFill: Rgba;
  frameStroke: Rgba;
  dividerStroke: Rgba;
  glyphFill: Rgba;
  labelText: Rgba;
  clippedMark: Rgba;
  selectionStroke: Rgba;
  /** The glyph's own geometry: the outline and its on-curve points. */
  outlineStroke: Rgba;
  /** The way the outline is built: the handles and the off-curve points. */
  handleStroke: Rgba;
  baselineStroke: Rgba;
  squareStroke: Rgba;
  advanceStroke: Rgba;
  boundsStroke: Rgba;
  metricsStroke: Rgba;
  blankStroke: Rgba;
  missingFill: Rgba;
}

/** The colors to draw with. */
export interface GuardedPalette extends PaletteInput {
  hoverFill: Rgba;
}

/** Contrast the glyph ink must have on the card: WCAG AAA for text. */
const GLYPH_CONTRAST = 7;
/** Contrast of the label text on the label strip: WCAG AA for text. */
const LABEL_CONTRAST = 4.5;
/** Contrast of marks that carry meaning (selection, warning): WCAG non-text. */
const MARK_CONTRAST = 3;
/** Lines are quiet guides, but must not vanish. */
const LINE_CONTRAST = 1.5;

const rgb = (r: number, g: number, b: number): Rgba => [r, g, b, 1];

// Safe colors, for a dark card and for a light one. Only the neutrals: a hue
// the theme gives is never replaced by another hue, only mixed toward the ink
// (see `legibleOn`), so the guides stay the theme's own colors.
const SAFE = {
  dark: {
    ink: rgb(0xe6, 0xe8, 0xee),
    text: rgb(0x9a, 0xa0, 0xb2),
    hover: 0.16,
  },
  light: {
    ink: rgb(0x14, 0x17, 0x1f),
    text: rgb(0x58, 0x60, 0x70),
    hover: 0.09,
  },
} as const;

/**
 * Check the theme's colors and replace the ones that are not readable. Colors
 * that pass are kept exactly as the theme gave them, so a well-made theme is
 * never second-guessed. The hover tint is made from the final selection color,
 * so it follows it when it is replaced.
 */
export function guardPalette(input: PaletteInput): GuardedPalette {
  // The card is what everything else is measured against. An editor background
  // is opaque; if it is not, it is shown over white.
  const white = rgb(255, 255, 255);
  const cardFill = flatten(input.cardFill, white);
  const labelFill = flatten(input.labelFill, cardFill);
  const safe = isDark(cardFill) ? SAFE.dark : SAFE.light;

  const glyphFill = ensureContrast(input.glyphFill, cardFill, GLYPH_CONTRAST, [
    safe.ink,
  ]);
  // A mark the theme colors that is too faint on the card is mixed toward the
  // ink, as little as it takes, so it keeps its hue.
  const mark = (color: Rgba, on: Rgba, minimum: number) =>
    legibleOn(color, on, glyphFill, minimum);
  const selectionStroke = mark(input.selectionStroke, cardFill, MARK_CONTRAST);
  const inkOnTranslucent = withAlpha(safe.ink, 0.3);
  return {
    cardFill,
    labelFill,
    dividerStroke: input.dividerStroke,
    frameStroke: ensureContrast(input.frameStroke, cardFill, LINE_CONTRAST, [
      inkOnTranslucent,
    ]),
    squareStroke: ensureContrast(input.squareStroke, cardFill, LINE_CONTRAST, [
      withAlpha(safe.ink, 0.4),
    ]),
    glyphFill,
    labelText: ensureContrast(input.labelText, labelFill, LABEL_CONTRAST, [
      safe.text,
      safe.ink,
    ]),
    clippedMark: mark(input.clippedMark, labelFill, MARK_CONTRAST),
    advanceStroke: mark(input.advanceStroke, cardFill, MARK_CONTRAST),
    boundsStroke: mark(input.boundsStroke, cardFill, MARK_CONTRAST),
    metricsStroke: ensureContrast(
      input.metricsStroke,
      cardFill,
      LINE_CONTRAST,
      [withAlpha(safe.ink, 0.5)],
    ),
    blankStroke: mark(input.blankStroke, cardFill, LINE_CONTRAST),
    missingFill: flatten(input.missingFill, cardFill),
    selectionStroke,
    outlineStroke: mark(input.outlineStroke, cardFill, MARK_CONTRAST),
    handleStroke: mark(input.handleStroke, cardFill, LINE_CONTRAST),
    baselineStroke: mark(input.baselineStroke, cardFill, LINE_CONTRAST),
    hoverFill: withAlpha(selectionStroke, safe.hover),
  };
}
