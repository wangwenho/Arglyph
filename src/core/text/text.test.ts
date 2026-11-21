import { describe, expect, it } from "vitest";
import { buildGridModel } from "../grid/model.ts";
import {
  analyzeText,
  characterNearCaret,
  cssLetterSpacing,
  cssLineHeight,
  DEFAULT_TEXT_STYLE,
  isTextCharacter,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  normalizeLetterSpacing,
  normalizeLineHeight,
  stepTextSize,
  TEXT_SIZE_STEP,
  textCharacterOffsets,
  textMarker,
} from "./text.ts";

// A font with A (drawn), B (an empty glyph where Unicode expects ink) and a
// space (empty, as it should be). glyph 0 is .notdef.
const model = buildGridModel(
  { 65: 1, 66: 2, 32: 3 },
  4,
  Uint8Array.from([1, 0, 1, 1]),
);
const mark = textMarker(model);

describe("textMarker", () => {
  it("has no mark for a drawn glyph or a blank one that should be blank", () => {
    expect(mark(65)).toBeNull();
    expect(mark(32)).toBeNull();
  });

  it("marks a glyph with no outline where ink is expected", () => {
    expect(mark(66)).toBe("undrawn");
  });

  it("marks a character the font does not have", () => {
    expect(mark(0x4e00)).toBe("missing");
  });

  it("does not mark a missing character a font is not expected to have", () => {
    expect(mark(0x0a)).toBeNull(); // a line break: a control
    expect(mark(0xe000)).toBeNull(); // private use
  });
});

describe("analyzeText", () => {
  it("keeps what is fine as one run and sets each marked character apart", () => {
    const result = analyzeText("AB國A", mark);
    expect(result.runs).toEqual([
      { text: "A", mark: null },
      { text: "B", mark: "undrawn" },
      { text: "國", mark: "missing" },
      { text: "A", mark: null },
    ]);
  });

  it("counts characters without the white space, and the marks", () => {
    const result = analyzeText("A B\n國國", mark);
    expect(result.characters).toBe(4);
    expect(result.undrawn).toBe(1);
    expect(result.missing).toBe(2);
  });

  it("lists each missing code point once, in the order it appears", () => {
    const result = analyzeText("乙甲乙甲", mark);
    expect(result.missingCodepoints).toEqual([0x4e59, 0x7532]);
  });

  it("does not split a character outside the BMP", () => {
    const result = analyzeText("\u{20000}A", mark);
    expect(result.runs[0]).toEqual({ text: "\u{20000}", mark: "missing" });
    expect(result.characters).toBe(2);
  });

  it("is empty for no text", () => {
    expect(analyzeText("", mark)).toEqual({
      runs: [],
      characters: 0,
      missing: 0,
      undrawn: 0,
      missingCodepoints: [],
    });
  });
});

describe("textCharacterOffsets", () => {
  it("gives where each character starts, leaving white space out", () => {
    expect(textCharacterOffsets("A B\n國")).toEqual([0, 2, 4]);
  });

  it("counts in UTF-16 units: a character outside the BMP takes two", () => {
    expect(textCharacterOffsets("\u{20000}A")).toEqual([0, 2]);
  });

  it("is empty for white space only", () => {
    expect(textCharacterOffsets(" \n\t")).toEqual([]);
    expect(isTextCharacter(" ")).toBe(false);
    expect(isTextCharacter("國")).toBe(true);
  });
});

describe("characterNearCaret, preferring the one before", () => {
  it("takes the character just typed, not the next one", () => {
    expect(characterNearCaret("AB國", 1, "before")).toBe(0);
    expect(characterNearCaret("AB國", 2, "before")).toBe(1);
  });
  it("falls back to the one after at the start, or after white space", () => {
    expect(characterNearCaret("AB國", 0, "before")).toBe(0);
    expect(characterNearCaret("A B", 2, "before")).toBe(2);
  });
  it("keeps a surrogate pair whole", () => {
    expect(characterNearCaret("A\u{20000}", 3, "before")).toBe(1);
  });
});

describe("characterNearCaret", () => {
  it("is the character after the caret", () => {
    expect(characterNearCaret("AB國", 1)).toBe(1);
    expect(characterNearCaret("AB國", 0)).toBe(0);
  });

  it("is the character before it at the end of the text, or before white space", () => {
    expect(characterNearCaret("AB國", 3)).toBe(2);
    expect(characterNearCaret("A B", 1)).toBe(0);
  });

  it("has none between white space, or in no text", () => {
    expect(characterNearCaret("A  B", 2)).toBeNull();
    expect(characterNearCaret("", 0)).toBeNull();
  });

  it("starts a character outside the BMP at its first unit", () => {
    expect(characterNearCaret("A\u{20000}", 1)).toBe(1);
    expect(characterNearCaret("A\u{20000}", 3)).toBe(1);
  });
});

describe("text style", () => {
  it("starts as the text was always set: horizontal, 1.5 lines, no spacing", () => {
    expect(DEFAULT_TEXT_STYLE).toEqual({
      orientation: "horizontal",
      lineHeight: 1.5,
      letterSpacing: 0,
    });
    expect(cssLineHeight(DEFAULT_TEXT_STYLE)).toBe("1.5");
    expect(cssLetterSpacing(DEFAULT_TEXT_STYLE)).toBe("0em");
  });

  it("gives the font's own line height as `normal`", () => {
    expect(cssLineHeight({ ...DEFAULT_TEXT_STYLE, lineHeight: null })).toBe(
      "normal",
    );
  });

  it("makes letter spacing a share of the font size, in em", () => {
    expect(cssLetterSpacing({ ...DEFAULT_TEXT_STYLE, letterSpacing: 5 })).toBe(
      "0.05em",
    );
    expect(
      cssLetterSpacing({ ...DEFAULT_TEXT_STYLE, letterSpacing: -10 }),
    ).toBe("-0.1em");
  });

  it("keeps the line height in range and to two decimals", () => {
    expect(normalizeLineHeight(0.1)).toBe(0.8);
    expect(normalizeLineHeight(9)).toBe(3);
    expect(normalizeLineHeight(1.234)).toBe(1.23);
    expect(normalizeLineHeight(null)).toBeNull();
    expect(normalizeLineHeight(Number.NaN)).toBeNull();
  });

  it("keeps the letter spacing in range and to one decimal", () => {
    expect(normalizeLetterSpacing(-80)).toBe(-10);
    expect(normalizeLetterSpacing(80)).toBe(50);
    expect(normalizeLetterSpacing(2.26)).toBe(2.3);
    expect(normalizeLetterSpacing(Number.NaN)).toBe(0);
  });
});

describe("stepTextSize", () => {
  it("adds or takes one step, and stays in range", () => {
    expect(stepTextSize(32, 1)).toBe(32 + TEXT_SIZE_STEP);
    expect(stepTextSize(32, -1)).toBe(32 - TEXT_SIZE_STEP);
    expect(stepTextSize(MAX_TEXT_SIZE, 1)).toBe(MAX_TEXT_SIZE);
    expect(stepTextSize(MIN_TEXT_SIZE, -1)).toBe(MIN_TEXT_SIZE);
    expect(stepTextSize(MAX_TEXT_SIZE - 1, 1)).toBe(MAX_TEXT_SIZE);
  });
});
