import { describe, expect, it } from "vitest";
import { blockIndexOf, unicodeBlocks } from "../unicode/blocks.ts";
import { codepointRangeModel } from "./blocks.ts";
import { buildGridModel, type GridModel } from "./model.ts";
import {
  bareHexHint,
  describeSearch,
  parseSearch,
  searchModel,
} from "./search.ts";

function ranges(text: string) {
  const query = parseSearch(text);
  if (query.kind !== "match") throw new Error(`expected a match for ${text}`);
  return query.ranges;
}

describe("parseSearch: code points", () => {
  it("reads U+ and 0x, in either case", () => {
    expect(ranges("U+4E00")).toEqual([[0x4e00, 0x4e00]]);
    expect(ranges("u+4e00")).toEqual([[0x4e00, 0x4e00]]);
    expect(ranges("0x4E00")).toEqual([[0x4e00, 0x4e00]]);
    expect(ranges("  U+20000  ")).toEqual([[0x20000, 0x20000]]);
  });

  it("reads ranges with -, .. or ~, with or without prefix and spaces", () => {
    const expected = [[0x4e00, 0x4e2f]];
    for (const text of [
      "U+4E00-4E2F",
      "U+4E00-U+4E2F",
      "U+4E00 - U+4E2F",
      "U+4E00..4E2F",
      "U+4E00 .. U+4E2F",
      "U+4E00~4E2F",
      "0x4e00-0x4e2f",
    ]) {
      expect(ranges(text)).toEqual(expected);
    }
  });

  it("reads several terms, separated by spaces, commas or semicolons", () => {
    expect(ranges("U+4E01 U+4E00,U+20000; 4E03")).toEqual([
      [0x4e00, 0x4e01],
      [0x4e03, 0x4e03],
      [0x20000, 0x20000],
    ]);
  });

  it("puts a reversed range the right way round, and merges what overlaps or touches", () => {
    expect(ranges("U+4E2F-4E00")).toEqual([[0x4e00, 0x4e2f]]);
    expect(ranges("U+4E00-4E10 U+4E08-4E20 U+4E21")).toEqual([
      [0x4e00, 0x4e21],
    ]);
  });

  it("waits while the user is still typing: a bare prefix or a trailing dash is not an error", () => {
    expect(parseSearch("U+")).toEqual({ kind: "none" });
    expect(parseSearch("0x")).toEqual({ kind: "none" });
    expect(ranges("U+4E00-")).toEqual([[0x4e00, 0x4e00]]);
    expect(ranges("U+4E00..")).toEqual([[0x4e00, 0x4e00]]);
    expect(ranges("U+4E00 U+")).toEqual([[0x4e00, 0x4e00]]);
  });

  it("says what is wrong with a term it cannot read", () => {
    expect(parseSearch("U+4E0G")).toEqual({
      kind: "error",
      message: "Not a code point: U+4E0G",
    });
    expect(parseSearch("U+4E00 hello")).toMatchObject({ kind: "error" });
    expect(parseSearch("U+1234567")).toMatchObject({ kind: "error" });
  });

  it("refuses code points beyond the end of Unicode, accepts the last one", () => {
    expect(parseSearch("U+110000")).toEqual({
      kind: "error",
      message: "Beyond U+10FFFF: U+110000",
    });
    expect(ranges("U+10FFFF")).toEqual([[0x10ffff, 0x10ffff]]);
    expect(ranges("U+0")).toEqual([[0, 0]]);
  });
});

describe("parseSearch: characters", () => {
  it("makes one term of each character", () => {
    expect(ranges("國")).toEqual([[0x570b, 0x570b]]);
    expect(ranges("國家")).toEqual([
      [0x570b, 0x570b],
      [0x5bb6, 0x5bb6],
    ]);
  });

  it("does not split a character outside the BMP into surrogates", () => {
    // U+20000 is two UTF-16 units; for...of walks it as one code point.
    expect("\u{20000}".length).toBe(2);
    expect(ranges("\u{20000}")).toEqual([[0x20000, 0x20000]]);
    expect(ranges("a\u{20000}b")).toEqual([
      [0x61, 0x62],
      [0x20000, 0x20000],
    ]);
  });

  it("ignores whitespace and merges neighbours into one range", () => {
    expect(ranges("a b\tc\n")).toEqual([[0x61, 0x63]]);
    expect(ranges("ba")).toEqual([[0x61, 0x62]]);
  });

  it("treats a bare hex number as characters, not as a code point", () => {
    expect(ranges("4E00")).toEqual([
      [0x30, 0x30],
      [0x34, 0x34],
      [0x45, 0x45],
    ]);
    expect(ranges("bad")).toEqual([
      [0x61, 0x62], // a, b (there is no c in "bad")
      [0x64, 0x64], // d
    ]);
  });

  it("is no query for empty or blank text", () => {
    expect(parseSearch("")).toEqual({ kind: "none" });
    expect(parseSearch("  \t ")).toEqual({ kind: "none" });
  });
});

describe("bareHexHint", () => {
  it("offers the U+ form for what looks like a code point", () => {
    expect(bareHexHint("4e00")).toBe("U+4E00");
    expect(bareHexHint(" 20000 ")).toBe("U+20000");
    expect(bareHexHint("10FFFF")).toBe("U+10FFFF");
  });

  it("stays quiet for anything else", () => {
    expect(bareHexHint("abc")).toBeNull(); // too short
    expect(bareHexHint("1234567")).toBeNull(); // too long
    expect(bareHexHint("110000")).toBeNull(); // beyond Unicode
    expect(bareHexHint("U+4E00")).toBeNull();
    expect(bareHexHint("國")).toBeNull();
    expect(bareHexHint("")).toBeNull();
  });
});

// Code points: 41 42 43 | 4E00 4E01 4E02 4E03 | 20000 20001, then gid 0, 10, 11.
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

describe("searchModel", () => {
  it("finds several ranges in order", () => {
    expect(
      codepoints(searchModel(full, ranges("U+20000 U+41 U+4E03"))),
    ).toEqual([0x41, 0x4e03, 0x20000]);
  });

  it("finds nothing for a code point the model does not have, or a range between items", () => {
    expect(searchModel(full, ranges("U+5000")).count).toBe(0);
    expect(searchModel(full, ranges("U+4E04-4FFF")).count).toBe(0);
    expect(
      searchModel(full, ranges("U+4E04-4FFF")).nearestIndexOfKey(0x4e04),
    ).toBe(0);
  });

  it("never finds the glyphs without a code point", () => {
    expect(searchModel(full, ranges("U+0-10FFFF")).count).toBe(9);
  });

  it("searches inside a block: the two narrowings are an AND", () => {
    const cjk = unicodeBlocks[blockIndexOf(0x4e00)];
    const block = codepointRangeModel(full, cjk.start, cjk.end);
    expect(codepoints(searchModel(block, ranges("U+41-4E01")))).toEqual([
      0x4e00, 0x4e01,
    ]);
    expect(searchModel(block, ranges("U+20000")).count).toBe(0);
  });
});

describe("describeSearch", () => {
  it("says why there is nothing to show: filtered out, in other blocks, or not in the font", () => {
    expect(describeSearch({ shown: 3, inBlock: 3, inFont: 9 })).toEqual({
      kind: "results",
      count: 3,
    });
    expect(describeSearch({ shown: 0, inBlock: 2, inFont: 9 })).toEqual({
      kind: "hidden",
      count: 2,
    });
    expect(describeSearch({ shown: 0, inBlock: 0, inFont: 4 })).toEqual({
      kind: "elsewhere",
      count: 4,
    });
    expect(describeSearch({ shown: 0, inBlock: 0, inFont: 0 })).toEqual({
      kind: "absent",
    });
  });
});
