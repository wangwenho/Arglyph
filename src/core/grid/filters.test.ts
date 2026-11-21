import { describe, expect, it } from "vitest";
import {
  GLYPH_BLANK,
  GLYPH_DRAWN,
  GLYPH_MISSING,
  GLYPH_UNDRAWN,
} from "../glyph/state.ts";
import { blockIndexOf, unicodeBlocks } from "../unicode/blocks.ts";
import { codepointRangeModel } from "./blocks.ts";
import {
  blockCellsModel,
  countStates,
  FILTER_ALL,
  FILTER_BLANK,
  FILTER_DRAWN,
  FILTER_MAPPED,
  FILTER_MISSING,
  FILTER_UNDRAWN,
  modelForStateFilter,
  modelWithStates,
  resolveStateFilter,
} from "./filters.ts";
import { buildGridModel, type GridModel } from "./model.ts";

// Glyph 1 is a space, 2 an "A", 3 and 4 two ideographs (3 empty), 5 a variation
// selector, 6 an ideograph. Glyphs 0 and 7 have no code point. Empty glyphs:
// 0, 1, 3, 5, 7. In order: 20 41 4E00 4E01 4E03 FE0F, then gid 0 and gid 7.
const CMAP: Record<string, number> = Object.fromEntries([
  [0x20, 1],
  [0x41, 2],
  [0x4e00, 3],
  [0x4e01, 4],
  [0x4e03, 6],
  [0xfe0f, 5],
]);
const EMPTY = Uint8Array.from([1, 1, 0, 1, 0, 1, 0, 1]);
const full = buildGridModel(CMAP, 8, EMPTY);
const cjk = unicodeBlocks[blockIndexOf(0x4e00)];
const latin = unicodeBlocks[blockIndexOf(0x41)];

function codepoints(model: GridModel): number[] {
  return Array.from({ length: model.count }, (_, i) => model.codepointAt(i));
}

/** A font that maps just these code points, each to its own glyph, all empty. */
function emptyFont(...mapped: number[]): GridModel {
  return buildGridModel(
    Object.fromEntries(mapped.map((cp, i) => [cp, i + 1])),
    mapped.length + 1,
    new Uint8Array(mapped.length + 1).fill(1),
  );
}

describe("stateAt and countStates", () => {
  it("classifies by outline and by what Unicode says the code point is", () => {
    const states = Array.from({ length: full.count }, (_, i) =>
      full.stateAt(i),
    );
    expect(states).toEqual([
      GLYPH_BLANK, // space
      GLYPH_DRAWN, // A
      GLYPH_UNDRAWN, // ideograph with an empty outline
      GLYPH_DRAWN,
      GLYPH_DRAWN,
      GLYPH_BLANK, // variation selector
      GLYPH_BLANK, // gid 0, no code point
      GLYPH_BLANK, // gid 7, no code point
    ]);
    expect(countStates(full)).toEqual({
      drawn: 3,
      blank: 4,
      undrawn: 1,
      missing: 0,
    });
  });

  it("calls everything drawn when nothing is known about the outlines", () => {
    const unknown = buildGridModel(CMAP, 8);
    expect(countStates(unknown)).toEqual({
      drawn: 8,
      blank: 0,
      undrawn: 0,
      missing: 0,
    });
  });

  it("judges an empty glyph only where Unicode says it should show ink", () => {
    // Blank: the Hangul fillers and the braille blank are invisible by design,
    // a control and a private-use code point say nothing about their shape.
    const blank = emptyFont(0x0, 0xe000, 0x3164, 0xffa0, 0x2800, 0x200d);
    expect(countStates(blank)).toEqual({
      drawn: 0,
      blank: 7, // the six above and glyph 0, which no code point maps to
      undrawn: 0,
      missing: 0,
    });
    // Undrawn: a letter, an ideograph, a symbol, a braille cell with a dot.
    const undrawn = emptyFont(0x41, 0x4e00, 0x2603, 0x2801);
    expect(countStates(undrawn).undrawn).toBe(4);
  });
});

describe("modelWithStates", () => {
  it("keeps the items in the wanted states, in order", () => {
    expect(codepoints(modelWithStates(full, [GLYPH_DRAWN]))).toEqual([
      0x41, 0x4e01, 0x4e03,
    ]);
    expect(codepoints(modelWithStates(full, [GLYPH_UNDRAWN]))).toEqual([
      0x4e00,
    ]);
    expect(modelWithStates(full, [GLYPH_MISSING]).count).toBe(0);
  });
});

describe("blockCellsModel", () => {
  const cells = blockCellsModel(full, cjk);

  it("has a cell for every character of the block", () => {
    expect(cells.count).toBe(20992);
    expect(cells.codepointAt(0)).toBe(0x4e00);
    expect(cells.codepointAt(20991)).toBe(0x9fff);
  });

  it("shows the font's glyphs where it has them and nothing elsewhere", () => {
    expect(cells.glyphIndexAt(0)).toBe(3); // U+4E00
    expect(cells.stateAt(0)).toBe(GLYPH_UNDRAWN);
    expect(cells.glyphIndexAt(1)).toBe(4); // U+4E01
    expect(cells.stateAt(1)).toBe(GLYPH_DRAWN);
    expect(cells.glyphIndexAt(2)).toBe(-1); // U+4E02: not in the font
    expect(cells.stateAt(2)).toBe(GLYPH_MISSING);
    expect(cells.labelAt(2)).toBe("U+4E02");
    expect(cells.glyphIndexAt(3)).toBe(6); // U+4E03
  });

  it("counts the font's states plus the missing ones", () => {
    expect(countStates(cells)).toEqual({
      drawn: 2,
      blank: 0,
      undrawn: 1,
      missing: 20992 - 3,
    });
  });

  it("skips unassigned code points unless the font has them", () => {
    const punctuation = unicodeBlocks[blockIndexOf(0x2000)];
    // U+2065 is unassigned. The first font lacks it, the second maps it.
    const without = buildGridModel(Object.fromEntries([[0x2000, 1]]), 2);
    const withIt = buildGridModel(
      Object.fromEntries([
        [0x2000, 1],
        [0x2065, 2],
      ]),
      3,
    );
    const lacking = blockCellsModel(without, punctuation);
    const having = blockCellsModel(withIt, punctuation);
    expect(lacking.count).toBe(111);
    expect(lacking.indexOfKey(0x2065)).toBe(-1);
    expect(having.count).toBe(112);
    expect(having.stateAt(having.indexOfKey(0x2065))).toBe(GLYPH_DRAWN);
  });

  it("does not call a control missing: Basic Latin has 95 characters, not 128", () => {
    const font = buildGridModel(Object.fromEntries([[0x41, 1]]), 2);
    const latinCells = blockCellsModel(font, latin);
    expect(latinCells.count).toBe(95);
    expect(latinCells.indexOfKey(0x1)).toBe(-1); // a control: not a cell
    expect(latinCells.indexOfKey(0x7f)).toBe(-1);
    expect(latinCells.indexOfKey(0x20)).toBe(0); // space: expected, so missing
    expect(latinCells.stateAt(0)).toBe(GLYPH_MISSING);
  });

  it("shows a control the font does map, without judging it", () => {
    const font = emptyFont(0x0, 0x41);
    const latinCells = blockCellsModel(font, latin);
    expect(latinCells.count).toBe(96);
    expect(latinCells.codepointAt(0)).toBe(0x0);
    expect(latinCells.stateAt(0)).toBe(GLYPH_BLANK);
  });

  it("lists only what a font maps in private use, which nobody has to have", () => {
    const privateUse = unicodeBlocks[blockIndexOf(0xe000)];
    const font = emptyFont(0xe000, 0xe0ff);
    const privateCells = blockCellsModel(font, privateUse);
    expect(codepoints(privateCells)).toEqual([0xe000, 0xe0ff]);
    expect(countStates(privateCells).missing).toBe(0);
    expect(countStates(privateCells).undrawn).toBe(0); // not judged either
  });

  it("is empty for a block with nothing expected and nothing in the font", () => {
    const reserved = { start: 0x378, end: 0x379, name: "x", plane: 0 };
    expect(blockCellsModel(full, reserved).count).toBe(0);
  });
});

describe("state filter choices", () => {
  it("needs a block for Missing and Mapped + Missing, and falls back to Mapped", () => {
    expect(resolveStateFilter(FILTER_MISSING, false)).toBe(FILTER_MAPPED);
    expect(resolveStateFilter(FILTER_ALL, false)).toBe(FILTER_MAPPED);
    expect(resolveStateFilter(FILTER_MISSING, true)).toBe(FILTER_MISSING);
    expect(resolveStateFilter(FILTER_ALL, true)).toBe(FILTER_ALL);
    expect(resolveStateFilter(FILTER_BLANK, false)).toBe(FILTER_BLANK);
  });

  it("gives the model of the filter", () => {
    const window = codepointRangeModel(full, cjk.start, cjk.end);
    const cells = blockCellsModel(full, cjk);
    expect(modelForStateFilter(window, cells, FILTER_MAPPED)).toBe(window);
    expect(
      codepoints(modelForStateFilter(window, cells, FILTER_DRAWN)),
    ).toEqual([0x4e01, 0x4e03]);
    expect(
      codepoints(modelForStateFilter(window, cells, FILTER_UNDRAWN)),
    ).toEqual([0x4e00]);
    expect(
      codepoints(modelForStateFilter(window, cells, FILTER_BLANK)),
    ).toEqual([]);
    expect(modelForStateFilter(window, cells, FILTER_ALL)).toBe(cells);
  });

  it("Missing shows only the characters the font lacks; the numbers add up", () => {
    const window = codepointRangeModel(full, cjk.start, cjk.end);
    const cells = blockCellsModel(full, cjk);
    const missing = modelForStateFilter(window, cells, FILTER_MISSING);
    expect(missing.count).toBe(20992 - 3);
    expect(missing.codepointAt(0)).toBe(0x4e02); // 4E00 and 4E01 are mapped
    expect(countStates(missing).missing).toBe(missing.count);
    // Mapped + Missing is the whole block.
    expect(window.count + missing.count).toBe(cells.count);
  });
});
