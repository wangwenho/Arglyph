import { describe, expect, it } from "vitest";
import { blockIndexOf, unicodeBlocks } from "../unicode/blocks.ts";
import {
  ALL_ITEMS,
  blockChoiceValue,
  codepointLowerBound,
  codepointRangeModel,
  countUnmapped,
  NO_CODEPOINT,
  resolveBlockChoice,
  summarizeBlocks,
  unmappedModel,
  windowModel,
} from "./blocks.ts";
import { buildGridModel, type GridModel } from "./model.ts";

// Code points: 41 42 43 | 4E00 4E01 4E02 4E03 | 20000 20001, then the three
// glyphs without one (0, 10 and 11): 12 items in all.
const CMAP: Record<string, number> = Object.fromEntries([
  [0x41, 1],
  [0x42, 2],
  [0x43, 3],
  [0x4e00, 4],
  [0x4e01, 5],
  [0x4e02, 6],
  [0x4e03, 7],
  [0x20000, 8],
  [0x20001, 9],
]);
const full = buildGridModel(CMAP, 12);

function codepoints(model: GridModel): number[] {
  return Array.from({ length: model.count }, (_, i) => model.codepointAt(i));
}

describe("codepointLowerBound", () => {
  it("finds the first item at or after a code point", () => {
    expect(codepointLowerBound(full, 0)).toBe(0);
    expect(codepointLowerBound(full, 0x42)).toBe(1);
    expect(codepointLowerBound(full, 0x44)).toBe(3);
    expect(codepointLowerBound(full, 0x4e00)).toBe(3);
    expect(codepointLowerBound(full, 0x20002)).toBe(9);
  });

  it("puts the items without a code point after every code point", () => {
    expect(codepointLowerBound(full, 0x10ffff)).toBe(9);
    expect(codepointLowerBound(full, 0x110000)).toBe(9);
  });

  it("returns 0 for an empty model", () => {
    expect(codepointLowerBound(buildGridModel({}, 0), 0x41)).toBe(0);
  });
});

describe("windowModel", () => {
  const window = windowModel(full, 3, 7); // 4E00..4E03

  it("shows the chosen items, indexed from 0", () => {
    expect(window.count).toBe(4);
    expect(codepoints(window)).toEqual([0x4e00, 0x4e01, 0x4e02, 0x4e03]);
    expect(window.glyphIndexAt(0)).toBe(4);
    expect(window.labelAt(2)).toBe("U+4E02");
  });

  it("is an empty model when the range is empty or backwards", () => {
    expect(windowModel(full, 5, 5).count).toBe(0);
    expect(windowModel(full, 6, 2).count).toBe(0);
    expect(windowModel(full, 5, 5).nearestIndexOfKey(0x4e00)).toBe(0);
  });
});

describe("codepointRangeModel", () => {
  it("selects by code point range, both ends included", () => {
    expect(codepoints(codepointRangeModel(full, 0x41, 0x43))).toEqual([
      0x41, 0x42, 0x43,
    ]);
    expect(codepoints(codepointRangeModel(full, 0x4e01, 0x4e02))).toEqual([
      0x4e01, 0x4e02,
    ]);
  });

  it("never includes glyphs without a code point", () => {
    expect(codepointRangeModel(full, 0, 0x10ffff).count).toBe(9);
  });
});

describe("unmappedModel", () => {
  it("is the glyphs no code point maps to, by glyph index", () => {
    const unmapped = unmappedModel(full);
    expect(unmapped.count).toBe(3);
    expect([0, 1, 2].map((i) => unmapped.glyphIndexAt(i))).toEqual([0, 10, 11]);
    expect(unmapped.labelAt(1)).toBe("gid 10");
    expect(countUnmapped(full)).toBe(3);
  });
});

describe("summarizeBlocks", () => {
  it("lists only the blocks the font has code points in, with counts", () => {
    const summary = summarizeBlocks(full, unicodeBlocks);
    const named = summary.map((s) => [
      unicodeBlocks[s.blockIndex].name,
      s.mapped,
    ]);
    expect(named).toEqual([
      ["Basic Latin", 3],
      ["CJK Unified Ideographs", 4],
      ["CJK Unified Ideographs Extension B", 2],
    ]);
  });

  it("counts the characters a font is expected to have apart from the other code points", () => {
    // Controls, private use and surrogates are mapped but not "characters": the
    // count to set against expectedCount() leaves them out.
    const odd = buildGridModel(
      Object.fromEntries([
        [0x0, 1], // control
        [0x41, 2], // letter
        [0x20, 3], // space (expected, and blank)
        [0xe000, 4], // private use
      ]),
      5,
    );
    const byName = new Map(
      summarizeBlocks(odd, unicodeBlocks).map((s) => [
        unicodeBlocks[s.blockIndex].name,
        [s.mapped, s.mappedCharacters],
      ]),
    );
    expect(byName.get("Basic Latin")).toEqual([3, 2]);
    expect(byName.get("Private Use Area")).toEqual([1, 0]);
  });
});

describe("block choices", () => {
  const coverage = summarizeBlocks(full, unicodeBlocks);
  const resolve = (choice: string, model = full) =>
    resolveBlockChoice(
      choice,
      summarizeBlocks(model, unicodeBlocks),
      countUnmapped(model),
      unicodeBlocks,
    );
  const cjk = unicodeBlocks[blockIndexOf(0x4e00)];
  const bopomofo = unicodeBlocks[blockIndexOf(0x3105)];

  it("keeps a choice the font has something under", () => {
    expect(resolve(ALL_ITEMS)).toBe(ALL_ITEMS);
    expect(resolve(NO_CODEPOINT)).toBe(NO_CODEPOINT);
    expect(resolve(blockChoiceValue(cjk))).toBe(blockChoiceValue(cjk));
    expect(coverage.length).toBe(3);
  });

  it("falls back to everything when the font has nothing there", () => {
    expect(resolve(blockChoiceValue(bopomofo))).toBe(ALL_ITEMS);
    expect(resolve("not a block")).toBe(ALL_ITEMS);
    const noUnmapped = buildGridModel(Object.fromEntries([[0x41, 0]]), 1);
    expect(resolve(NO_CODEPOINT, noUnmapped)).toBe(ALL_ITEMS);
  });
});
