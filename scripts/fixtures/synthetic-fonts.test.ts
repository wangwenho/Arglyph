import opentype from "opentype.js";
import { expect, it } from "vitest";
import { buildSynthesizedFont } from "./synthetic-fonts.ts";

// What the states checks of the e2e rely on, written down here too so that a
// change to the font fails at once and says what it was.
const font = opentype.parse(buildSynthesizedFont().toArrayBuffer());
const empty = (glyph: opentype.Glyph) => glyph.path.commands.length === 0;
const at = (codepoint: number) =>
  font.glyphs.get(font.charToGlyphIndex(String.fromCodePoint(codepoint)));

it("is a CFF font that opentype.js reads back", () => {
  expect(font.outlinesFormat).toBe("cff");
  expect(font.unitsPerEm).toBe(1000);
  expect(font.getEnglishName("fontFamily")).toBe("Synthesized");
});

it("has drawn, undrawn and blank glyphs, where each is expected", () => {
  expect(empty(at(0x4e00))).toBe(false); // U+4E00 is drawn: the search check needs it
  expect(empty(at(0x4e02))).toBe(true); // every third ideograph is undrawn
  expect(empty(at(0x20))).toBe(true); // the space is empty and meant to be
  expect(empty(at(0x41))).toBe(false);
  expect(empty(at(0x3042))).toBe(false);
});

it("has glyphs with no code point, and none of the ideographs out of its run", () => {
  const unmapped = [...Array(font.glyphs.length).keys()]
    .map((i) => font.glyphs.get(i))
    .filter((g) => g.name !== ".notdef" && g.unicodes.length === 0);
  expect(unmapped.length).toBeGreaterThanOrEqual(20);
  expect(font.charToGlyphIndex(String.fromCodePoint(0x4e00 + 3000))).toBe(0);
});
