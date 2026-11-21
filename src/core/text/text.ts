// Text typed to try a font: which characters of it the font cannot show as it
// should.
//
// The text is set by the browser, which does not tell the user when the font
// lacks a character: it quietly takes one from another font, and the text looks
// fine. For someone making a font that is exactly the wrong thing to hide, so
// every character is checked against the font here and the ones that are not
// the font's own are marked.

import { GLYPH_UNDRAWN } from "../glyph/state.ts";
import type { GridModel } from "../grid/model.ts";
import { clamp } from "../math.ts";
import { codepointKind, isExpectedKind } from "../unicode/categories.ts";

/** Pixels, as the toolbar slider has them while the text is shown. */
export const DEFAULT_TEXT_SIZE = 32;
export const MIN_TEXT_SIZE = 12;
export const MAX_TEXT_SIZE = 128;
/** What one press of the − and + (or Cmd and − or +) adds to the font size. */
export const TEXT_SIZE_STEP = 4;

/** The font size one step bigger (`direction` 1) or smaller (-1), kept in range. */
export function stepTextSize(size: number, direction: -1 | 1): number {
  return clamp(
    Math.round(size + direction * TEXT_SIZE_STEP),
    MIN_TEXT_SIZE,
    MAX_TEXT_SIZE,
  );
}

/** Which way the text runs: lines side by side, or columns from the right. */
export type TextOrientation = "horizontal" | "vertical";

/**
 * How the text is set, apart from the size. Both spacings are relative to the font
 * size, so that changing the size keeps the look of the text.
 */
export interface TextStyle {
  orientation: TextOrientation;
  /** The distance between lines (columns, when vertical) as a multiple of the font size; null: the font's own (CSS `normal`). */
  lineHeight: number | null;
  /** Added after every character, in percent of the font size (0: none). */
  letterSpacing: number;
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  orientation: "horizontal",
  lineHeight: 1.5,
  letterSpacing: 0,
};
export const MIN_LINE_HEIGHT = 0.8;
export const MAX_LINE_HEIGHT = 3;
export const MIN_LETTER_SPACING = -10;
export const MAX_LETTER_SPACING = 50;

/** A line height kept in range and to two decimals; null (the font's own) stays. */
export function normalizeLineHeight(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(clamp(value, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT) * 100) / 100;
}

/** A letter spacing kept in range and to one decimal. */
export function normalizeLetterSpacing(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TEXT_STYLE.letterSpacing;
  return (
    Math.round(clamp(value, MIN_LETTER_SPACING, MAX_LETTER_SPACING) * 10) / 10
  );
}

/** The CSS `line-height` of a style. */
export function cssLineHeight(style: TextStyle): string {
  return style.lineHeight === null ? "normal" : String(style.lineHeight);
}

/** The CSS `letter-spacing` of a style. */
export function cssLetterSpacing(style: TextStyle): string {
  return `${style.letterSpacing / 100}em`;
}

/** More than this is not text somebody typed to try a font. */
export const MAX_TEXT_LENGTH = 5000;

/**
 * What the text view starts with, and starts again with when it is shown empty:
 * a pangram, so every Latin letter shows at once. A font without Latin letters
 * shows Missing marks, which is what the view is for.
 */
export const DEFAULT_SAMPLE = "The quick brown fox jumps over the lazy dog.";

/**
 * How a character falls short:
 * - "missing": the font has no glyph, and Unicode says it should
 * - "undrawn": the font maps it to a glyph that has no outline
 */
export type TextMark = "missing" | "undrawn";

/** A stretch of the text; a marked character is a run of its own, so it can be told about. */
export interface TextRun {
  text: string;
  mark: TextMark | null;
}

export interface TextAnalysis {
  runs: TextRun[];
  /** Code points that are not white space. */
  characters: number;
  missing: number;
  undrawn: number;
  /** The code points that are missing, each once, in the order they first appear. */
  missingCodepoints: number[];
}

/**
 * The mark of a code point for the font `model` describes (the whole font, not a
 * block of it). A code point the font does not have is only "missing" when a
 * font is expected to have it: a control character or a private-use one is not.
 */
export function textMarker(
  model: GridModel,
): (codepoint: number) => TextMark | null {
  return (codepoint) => {
    const index = model.indexOfKey(codepoint);
    if (index < 0) {
      return isExpectedKind(codepointKind(codepoint)) ? "missing" : null;
    }
    return model.stateAt(index) === GLYPH_UNDRAWN ? "undrawn" : null;
  };
}

const WHITE_SPACE = /\s/u;

/** A character that is something to look at: not white space. */
export function isTextCharacter(char: string): boolean {
  return !WHITE_SPACE.test(char);
}

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

// Where the character after the caret starts, null when there is none to look at.
function characterAfter(text: string, caret: number): number | null {
  const after = text.codePointAt(caret);
  return after !== undefined &&
    !isLowSurrogate(text.charCodeAt(caret)) &&
    isTextCharacter(String.fromCodePoint(after))
    ? caret
    : null;
}

// The same for the character before it.
function characterBefore(text: string, caret: number): number | null {
  if (caret <= 0) return null;
  let start = caret - 1;
  if (
    start > 0 &&
    isLowSurrogate(text.charCodeAt(start)) &&
    isHighSurrogate(text.charCodeAt(start - 1))
  ) {
    start--;
  }
  const before = text.codePointAt(start);
  return before !== undefined && isTextCharacter(String.fromCodePoint(before))
    ? start
    : null;
}

/**
 * Where the character a caret stands for starts. By default the one after it,
 * as in an editor; `prefer: "before"` is for after typing, when the character
 * the user just wrote is the one before the caret. When the preferred side has
 * nothing to look at (the end of the text, or white space), the other is used.
 * null when neither is something to look at.
 */
export function characterNearCaret(
  text: string,
  caret: number,
  prefer: "after" | "before" = "after",
): number | null {
  return prefer === "before"
    ? (characterBefore(text, caret) ?? characterAfter(text, caret))
    : (characterAfter(text, caret) ?? characterBefore(text, caret));
}

/**
 * Where each character that is something to look at starts in `text`, in UTF-16
 * units (what a text box's caret and `slice` count in). The zoom view walks
 * these when it was opened from the text.
 */
export function textCharacterOffsets(text: string): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const char of text) {
    if (isTextCharacter(char)) offsets.push(offset);
    offset += char.length;
  }
  return offsets;
}

export function analyzeText(
  text: string,
  markOf: (codepoint: number) => TextMark | null,
): TextAnalysis {
  const runs: TextRun[] = [];
  const missingCodepoints: number[] = [];
  const seenMissing = new Set<number>();
  let plain = "";
  let characters = 0;
  let missing = 0;
  let undrawn = 0;

  // for...of walks code points, so a character outside the BMP is not split.
  for (const char of text) {
    const codepoint = char.codePointAt(0) as number;
    if (isTextCharacter(char)) characters++;
    const mark = markOf(codepoint);
    if (mark === null) {
      plain += char;
      continue;
    }
    if (plain !== "") {
      runs.push({ text: plain, mark: null });
      plain = "";
    }
    runs.push({ text: char, mark });
    if (mark === "missing") {
      missing++;
      if (!seenMissing.has(codepoint)) {
        seenMissing.add(codepoint);
        missingCodepoints.push(codepoint);
      }
    } else {
      undrawn++;
    }
  }
  if (plain !== "") runs.push({ text: plain, mark: null });
  return { runs, characters, missing, undrawn, missingCodepoints };
}
