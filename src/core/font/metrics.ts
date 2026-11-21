// The vertical metrics of a font: which of the sets it carries to trust (typo,
// hhea, win), and the scale and baseline that put its glyphs inside a square of
// a given size.

import type { Font } from "opentype.js";

export interface GlyphMetrics {
  scale: number;
  ascent: number;
}

/**
 * Typo metrics are only trusted when they describe a real box. Some fonts ship
 * an OS/2 table whose typo fields are 0, which would put every baseline on the
 * top edge of its card.
 */
function hasUsableTypoMetrics(ascender: unknown, descender: unknown): boolean {
  return (
    typeof ascender === "number" &&
    typeof descender === "number" &&
    ascender > 0 &&
    ascender - descender > 0
  );
}

/** An ascender and a descender, in font units; the descender is below the baseline, so negative. */
export interface MetricSet {
  ascender: number;
  descender: number;
}

/**
 * The vertical metrics a font carries. They are three different sets, and they
 * often disagree (a Noto font has a typo box of exactly 1 em, and an hhea box
 * of 1.45 em): `typo` is the OS/2 one meant for every platform, `hhea` is what
 * macOS lays lines out with, `win` is what Windows does. Arglyph draws the
 * em square and the Metrics layer from `used`: typo when it is usable, else hhea.
 */
export interface FontVerticals {
  typo: MetricSet | null;
  hhea: MetricSet;
  win: MetricSet | null;
  used: "typo" | "hhea";
  /** From OS/2 version 2 or later; null when the font has none (or 0). */
  xHeight: number | null;
  capHeight: number | null;
}

const positive = (value: unknown): number | null =>
  typeof value === "number" && value > 0 ? value : null;

export function readVerticals(font: Font): FontVerticals {
  const os2 = font.tables.os2;
  const useTypo = hasUsableTypoMetrics(os2?.sTypoAscender, os2?.sTypoDescender);
  const winAscent = positive(os2?.usWinAscent);
  const winDescent = positive(os2?.usWinDescent);
  return {
    typo: useTypo
      ? {
          ascender: os2.sTypoAscender,
          descender: -Math.abs(os2.sTypoDescender),
        }
      : null,
    hhea: { ascender: font.ascender, descender: -Math.abs(font.descender) },
    win:
      winAscent !== null && winDescent !== null
        ? { ascender: winAscent, descender: -winDescent }
        : null,
    used: useTypo ? "typo" : "hhea",
    xHeight: positive(os2?.sxHeight),
    capHeight: positive(os2?.sCapHeight),
  };
}

/** The set the em square and the Metrics layer are drawn from. */
export function usedMetrics(verticals: FontVerticals): MetricSet {
  return verticals.typo && verticals.used === "typo"
    ? verticals.typo
    : verticals.hhea;
}

export function computeGlyphMetrics(
  font: Font,
  glyphSize: number,
): GlyphMetrics {
  const ascender = usedMetrics(readVerticals(font)).ascender;
  const scale = glyphSize / font.unitsPerEm;
  return { scale, ascent: ascender * scale };
}
