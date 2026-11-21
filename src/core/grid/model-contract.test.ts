// What every GridModel must do, whichever way it was made.
//
// The grid, the inspector, the view state and the search only know the GridModel
// interface; they work with a window over a block, an index list of one state,
// the cells of a block with its gaps or the result of a search just as with the
// whole font. That holds only if all of them keep the same promises, so the
// promises are checked here once, against each kind, instead of being repeated
// in the test of every kind:
//   - items are in order: code points ascending, then the glyphs without one by
//     glyph index
//   - a key names an item and survives the model being rebuilt: indexOfKey
//     inverts keyAt, and answers -1 for a key the model does not have
//   - nearestIndexOfKey is the first item at or after a key, or the last item
//   - labels and states agree with the code point and glyph of the item

import { describe, expect, it } from "vitest";
import {
  GLYPH_BLANK,
  GLYPH_DRAWN,
  GLYPH_MISSING,
  GLYPH_UNDRAWN,
} from "../glyph/state.ts";
import { blockIndexOf, unicodeBlocks } from "../unicode/blocks.ts";
import { codepointRangeModel, unmappedModel, windowModel } from "./blocks.ts";
import { blockCellsModel, modelWithStates, subsetModel } from "./filters.ts";
import { buildGridModel, type GridModel } from "./model.ts";
import { parseSearch, searchModel } from "./search.ts";

// 20 41 42 43 | 4E00 4E01 4E02 4E03 | FE0F | 20000 20001, then the glyphs no
// code point maps to (0, 12 and 13). Glyphs 1, 5, 7, 10 and 12 have no outline:
// the space and the variation selector are blank, the ideograph 4E01 is undrawn.
const CMAP: Record<string, number> = Object.fromEntries([
  [0x20, 1],
  [0x41, 2],
  [0x42, 3],
  [0x43, 4],
  [0x4e00, 5],
  [0x4e01, 6],
  [0x4e02, 7],
  [0x4e03, 8],
  [0xfe0f, 9],
  [0x20000, 10],
  [0x20001, 11],
]);
const EMPTY = new Uint8Array(14);
for (const glyph of [1, 6, 9, 12]) EMPTY[glyph] = 1;
const full = buildGridModel(CMAP, 14, EMPTY);
const latin = unicodeBlocks[blockIndexOf(0x41)];

const range = (text: string) => {
  const query = parseSearch(text);
  if (query.kind !== "match") throw new Error(`no match query: ${text}`);
  return query.ranges;
};

const MODELS: [string, GridModel][] = [
  ["the whole font", full],
  ["a window", windowModel(full, 3, 8)],
  ["a code point range", codepointRangeModel(full, 0x4e00, 0x4e03)],
  ["the glyphs without a code point", unmappedModel(full)],
  ["the glyphs in one state", modelWithStates(full, [GLYPH_DRAWN])],
  [
    "the glyphs in states with unmapped ones",
    modelWithStates(full, [GLYPH_BLANK, GLYPH_UNDRAWN]),
  ],
  ["a list of indices", subsetModel(full, Uint32Array.from([1, 4, 9]))],
  ["the cells of a block, gaps included", blockCellsModel(full, latin)],
  ["a search for one range", searchModel(full, range("U+4E00-4E02"))],
  [
    "a search for several ranges",
    searchModel(full, range("U+41 U+4E03 U+20000")),
  ],
  ["an empty window", windowModel(full, 5, 5)],
  ["a search that finds nothing", searchModel(full, range("U+5000"))],
  ["an empty list", modelWithStates(full, [GLYPH_MISSING])],
];

/** Where a key belongs in the order: code points first, then glyphs without one by glyph index. */
const rank = (key: number) => (key >= 0 ? key : 0x200000 + (-key - 1));

const keysOf = (model: GridModel) =>
  Array.from({ length: model.count }, (_, i) => model.keyAt(i));

// Every key of the whole font, plus some the font has nothing for: the keys a
// model must say -1 to, and the ones nearestIndexOfKey has to place.
const PROBES = [
  ...keysOf(full),
  0x10,
  0x4e00 - 1,
  0x4e04,
  0x5000,
  0x10ffff,
  -1000,
];

describe.each(MODELS)("GridModel contract: %s", (_name, model) => {
  it("lists code points ascending, then the glyphs without one", () => {
    const keys = keysOf(model);
    for (let i = 1; i < keys.length; i++) {
      expect(rank(keys[i - 1])).toBeLessThan(rank(keys[i]));
    }
  });

  it("names an item by its key, and finds it by that key", () => {
    for (let i = 0; i < model.count; i++) {
      expect(model.indexOfKey(model.keyAt(i))).toBe(i);
      expect(model.nearestIndexOfKey(model.keyAt(i))).toBe(i);
    }
  });

  it("does not find a key it does not have, and places it at the next item or the last", () => {
    const own = new Set(keysOf(model));
    for (const key of PROBES) {
      if (own.has(key)) continue;
      expect(model.indexOfKey(key)).toBe(-1);
      const keys = keysOf(model);
      const after = keys.findIndex((k) => rank(k) >= rank(key));
      expect(model.nearestIndexOfKey(key)).toBe(
        keys.length === 0 ? 0 : after === -1 ? keys.length - 1 : after,
      );
    }
  });

  it("labels, glyphs and states agree with the code point of each item", () => {
    for (let i = 0; i < model.count; i++) {
      const codepoint = model.codepointAt(i);
      expect(codepoint).toBe(model.keyAt(i) >= 0 ? model.keyAt(i) : -1);
      expect(model.labelAt(i)).toBe(
        codepoint >= 0
          ? `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`
          : `gid ${model.glyphIndexAt(i)}`,
      );
      expect(model.stateAt(i) === GLYPH_MISSING).toBe(
        model.glyphIndexAt(i) < 0,
      );
    }
  });
});
