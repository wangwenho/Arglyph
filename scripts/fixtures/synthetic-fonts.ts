// A font made for the tests: what the checks about states need and no real font
// has on purpose. It is built here, with opentype.js, so there is nothing to
// download and no license to ask about.
//
//   pnpm fetch:fixtures   (makes it, with the downloads)
//
// What is in it:
//   .notdef            empty, as every font has it
//   U+0020             a space: empty, and meant to be
//   U+0021-007E        drawn
//   U+3042-3093        the hiragana, drawn
//   U+4E00 on         3000 CJK ideographs, enough to be a few percent of their block.
//                      Every third (the third, sixth, ...) is mapped to an empty
//                      glyph: Undrawn. U+4E00 is drawn.
//   20 glyphs          drawn, and with no code point at all (Unmapped)
//
// opentype.js writes OpenType with CFF outlines, so this is the CFF font of the
// tests with gaps; the TrueType one is the Latin download.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

const UNITS = 1000;
const ADVANCE = 1000;
const CJK_START = 0x4e00;
const CJK_COUNT = 3000;
const HIRAGANA = [0x3042, 0x3093];
const UNMAPPED = 20;

/** A box with a hole at `inset`, so each glyph differs a little and has contours. */
function box(inset: number): opentype.Path {
  const outline = new opentype.Path();
  const [lo, hi] = [100 + inset, 900 - inset];
  outline.moveTo(lo, -100 + inset);
  outline.lineTo(hi, -100 + inset);
  outline.lineTo(hi, 800 - inset);
  outline.lineTo(lo, 800 - inset);
  outline.close();
  const [hlo, hhi] = [lo + 150, hi - 150];
  outline.moveTo(hlo, 50 + inset);
  outline.lineTo(hlo, 600 - inset);
  outline.lineTo(hhi, 600 - inset);
  outline.lineTo(hhi, 50 + inset);
  outline.close();
  return outline;
}

function glyph(
  name: string,
  unicode: number | undefined,
  drawn: boolean,
  index: number,
): opentype.Glyph {
  return new opentype.Glyph({
    name,
    unicode,
    advanceWidth: ADVANCE,
    path: drawn ? box((index % 7) * 20) : new opentype.Path(),
  });
}

/** The font, as a Font; `buildSynthesizedFont().toArrayBuffer()` is the file. */
export function buildSynthesizedFont(): opentype.Font {
  const glyphs = [glyph(".notdef", undefined, false, 0)];
  glyphs.push(glyph("space", 0x20, false, 0));
  for (let cp = 0x21; cp <= 0x7e; cp++) {
    glyphs.push(glyph(`uni${cp.toString(16).toUpperCase()}`, cp, true, cp));
  }
  for (let cp = HIRAGANA[0]; cp <= HIRAGANA[1]; cp++) {
    glyphs.push(glyph(`uni${cp.toString(16).toUpperCase()}`, cp, true, cp));
  }
  for (let i = 0; i < CJK_COUNT; i++) {
    const cp = CJK_START + i;
    // Every third one is mapped but has nothing to draw.
    glyphs.push(
      glyph(`uni${cp.toString(16).toUpperCase()}`, cp, i % 3 !== 2, i),
    );
  }
  for (let i = 0; i < UNMAPPED; i++) {
    glyphs.push(glyph(`unmapped${i}`, undefined, true, i));
  }
  return new opentype.Font({
    familyName: "Synthesized",
    styleName: "Regular",
    unitsPerEm: UNITS,
    ascender: 880,
    descender: -120,
    designer: "Arglyph",
    license: "Made for the tests of Arglyph. No restrictions.",
    glyphs,
  });
}

/** Write the font where the tests look for it, whatever was there. */
export function writeSynthesizedFont(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(buildSynthesizedFont().toArrayBuffer()));
}
