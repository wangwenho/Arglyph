// The facts about a font that the inspector shows.

import type { Font } from "opentype.js";
import { type FontVerticals, readVerticals } from "./metrics.ts";

export interface FontInfo {
  family: string;
  style: string;
  fullName: string;
  version: string;
  manufacturer: string;
  designer: string;
  copyright: string;
  license: string;
  /** "TrueType", "CFF" or "Unknown". */
  format: string;
  /** True when the font has variation axes (an `fvar` table). */
  variable: boolean;
  unitsPerEm: number;
  /** The ascender and descender sets, and the x-height and cap height. */
  verticals: FontVerticals;
  glyphCount: number;
  /** Number of code points in the cmap. */
  codepointCount: number;
}

function formatName(outlinesFormat: string): string {
  switch (outlinesFormat) {
    case "truetype":
      return "TrueType";
    case "cff":
      return "CFF";
    default:
      return "Unknown";
  }
}

/** Describe a parsed font. Name fields the font does not have are "". */
export function describeFont(font: Font): FontInfo {
  const name = (key: string) => font.getEnglishName(key) ?? "";
  return {
    family: name("fontFamily"),
    style: name("fontSubfamily"),
    fullName: name("fullName"),
    version: name("version"),
    manufacturer: name("manufacturer"),
    designer: name("designer"),
    copyright: name("copyright"),
    license: name("license"),
    format: formatName(font.outlinesFormat),
    variable: font.tables.fvar !== undefined,
    unitsPerEm: font.unitsPerEm,
    verticals: readVerticals(font),
    glyphCount: font.glyphs.length,
    codepointCount: Object.keys(font.tables.cmap?.glyphIndexMap ?? {}).length,
  };
}
