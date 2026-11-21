import { describe, expect, it } from "vitest";
import { findEmptyGlyphs } from "./emptiness.ts";

// ---- helpers that build tiny fonts ----------------------------------------

function bytes(...parts: (number | number[] | Uint8Array)[]): Uint8Array {
  return Uint8Array.from(
    parts.flatMap((p) => (typeof p === "number" ? [p] : [...p])),
  );
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** An sfnt file made of the given tables. */
function buildSfnt(
  version: number,
  tables: [tag: string, data: Uint8Array][],
): ArrayBuffer {
  const directoryEnd = 12 + tables.length * 16;
  const records: number[] = [];
  const bodies: number[] = [];
  let offset = directoryEnd;
  for (const [tag, data] of tables) {
    const padded = Math.ceil(data.length / 4) * 4;
    records.push(
      ...[...tag].map((c) => c.charCodeAt(0)),
      ...u32(0),
      ...u32(offset),
      ...u32(data.length),
    );
    bodies.push(...data, ...new Array(padded - data.length).fill(0));
    offset += padded;
  }
  return bytes(
    u32(version),
    u16(tables.length),
    new Array(6).fill(0),
    records,
    bodies,
  ).buffer as ArrayBuffer;
}

function headTable(longLoca: boolean): Uint8Array {
  const head = new Uint8Array(54);
  head[51] = longLoca ? 1 : 0;
  return head;
}

/** Glyphs: 0 nothing, 1 one contour, 2 zero contours, 3 composite, 4 nothing. */
function trueTypeFont(longLoca: boolean): ArrayBuffer {
  const header = (contours: number) => [
    ...u16(contours & 0xffff),
    ...new Array(8).fill(0),
  ];
  const glyf = bytes(
    header(1),
    0,
    0, // glyph 1: 12 bytes
    header(0), // glyph 2: 10 bytes, no contours
    header(-1),
    0,
    0, // glyph 3: composite, 12 bytes
  );
  const offsets = [0, 0, 12, 22, 34, 34];
  const loca = longLoca
    ? bytes(offsets.flatMap(u32))
    : bytes(offsets.flatMap((o) => u16(o / 2)));
  return buildSfnt(0x00010000, [
    ["glyf", glyf],
    ["head", headTable(longLoca)],
    ["loca", loca],
  ]);
}

// CFF: header, Name INDEX, Top DICT INDEX, String INDEX, Global Subr INDEX,
// then the CharStrings INDEX that the Top DICT points to.
function cffIndex(items: Uint8Array[]): Uint8Array {
  if (items.length === 0) return bytes(u16(0));
  const offsets = [1];
  for (const item of items) offsets.push((offsets.at(-1) ?? 1) + item.length);
  return bytes(u16(items.length), 2, offsets.flatMap(u16), ...items);
}

function cffFont(charstrings: Uint8Array[], tag = 0x4f54544f): ArrayBuffer {
  const header = bytes(1, 0, 4, 1);
  const names = cffIndex([bytes(65)]);
  // Top DICT: the CharStrings offset as a 32-bit integer, then operator 17.
  const topDictSize = 5 + 1;
  const topDictIndexSize = 2 + 1 + 2 * 2 + topDictSize;
  const charStringsOffset =
    header.length + names.length + topDictIndexSize + 2 + 2;
  const topDict = bytes(29, u32(charStringsOffset), 17);
  const cff = bytes(
    header,
    names,
    cffIndex([topDict]),
    cffIndex([]), // strings
    cffIndex([]), // global subroutines
    cffIndex(charstrings),
  );
  return buildSfnt(tag, [["CFF ", cff]]);
}

const ENDCHAR = 14;
const RMOVETO = 21;
const CALLSUBR = 10;
const num = (n: number) => n + 139; // an operand between -107 and 107

/** The result as a plain array; the test fails if the font was not understood. */
function emptyOf(font: ArrayBuffer, glyphCount: number): number[] {
  const result = findEmptyGlyphs(font, glyphCount);
  if (!result) throw new Error("expected the font to be understood");
  return [...result];
}

// ---- tests ----------------------------------------------------------------

describe("findEmptyGlyphs: TrueType", () => {
  for (const longLoca of [false, true]) {
    const format = longLoca ? "long" : "short";

    it(`reads the loca table (${format} offsets) and the contour count`, () => {
      // nothing, one contour, zero contours, composite, nothing
      expect(emptyOf(trueTypeFont(longLoca), 5)).toEqual([1, 0, 1, 0, 1]);
    });
  }

  it("gives null when loca is too short for the glyph count", () => {
    expect(findEmptyGlyphs(trueTypeFont(false), 50)).toBeNull();
  });

  it("gives null when a table is missing", () => {
    const font = buildSfnt(0x00010000, [["head", headTable(false)]]);
    expect(findEmptyGlyphs(font, 1)).toBeNull();
  });
});

/**
 * Glyph 0 nothing, 1 one contour, then composites: 2 of glyph 0, 3 of glyph 1,
 * 4 of glyphs 0 and 2 (two components), 5 of itself, 6 of glyphs 0 and 1.
 */
function compositeFont(): ArrayBuffer {
  const header = (contours: number) => [
    ...u16(contours & 0xffff),
    ...new Array(8).fill(0),
  ];
  const component = (flags: number, glyph: number) => [
    ...u16(flags),
    ...u16(glyph),
    0,
    0,
  ];
  const MORE = 0x0020;
  const glyf = bytes(
    header(1),
    0,
    0, // 1: 12 bytes
    header(-1),
    component(0, 0), // 2: 16
    header(-1),
    component(0, 1), // 3: 16
    header(-1),
    component(MORE, 0),
    component(0, 2), // 4: 22
    header(-1),
    component(0, 5), // 5: 16
    header(-1),
    component(MORE, 0),
    component(0, 1), // 6: 22
  );
  const offsets = [0, 0, 12, 28, 44, 66, 82, 104];
  const loca = bytes(offsets.flatMap((o) => u16(o / 2)));
  return buildSfnt(0x00010000, [
    ["glyf", glyf],
    ["head", headTable(false)],
    ["loca", loca],
  ]);
}

describe("findEmptyGlyphs: composite glyphs", () => {
  it("is empty only when every component is, however deep", () => {
    // [0] empty, [1] drawn, [2] of empty, [3] of drawn, [4] of empty + empty
    // composite, [5] of itself (a cycle), [6] of empty + drawn
    expect(emptyOf(compositeFont(), 7)).toEqual([1, 0, 1, 0, 1, 0, 0]);
  });
});

describe("findEmptyGlyphs: CFF", () => {
  it("is empty for endchar alone, or a width and endchar", () => {
    const font = cffFont([
      bytes(ENDCHAR), // nothing
      bytes(num(50), ENDCHAR), // a width, then nothing
      bytes(28, u16(600), ENDCHAR), // a 16-bit width
      bytes(255, u32(600 << 16), ENDCHAR), // a 32-bit width
    ]);
    expect(emptyOf(font, 4)).toEqual([1, 1, 1, 1]);
  });

  it("has an outline when the program does anything but endchar", () => {
    const font = cffFont([
      bytes(num(10), num(20), RMOVETO, ENDCHAR), // a move: has an outline
      bytes(num(5), CALLSUBR, ENDCHAR), // a subroutine call: has an outline
      bytes(num(1), num(2), 1, ENDCHAR), // a hint: counted as an outline
    ]);
    expect(emptyOf(font, 3)).toEqual([0, 0, 0]);
  });

  it("treats endchar with four or five operands (a composite) as drawn", () => {
    const four = bytes(num(0), num(0), num(65), num(768), ENDCHAR);
    const five = bytes(num(500), num(0), num(0), num(65), num(768), ENDCHAR);
    const font = cffFont([four, five]);
    expect(emptyOf(font, 2)).toEqual([0, 0]);
  });

  it("is empty for a program of no bytes, drawn for one cut short", () => {
    const font = cffFont([bytes(), bytes(num(1), num(2))]);
    expect(emptyOf(font, 2)).toEqual([1, 0]);
  });

  it("gives null when the CharStrings count is not the glyph count", () => {
    expect(findEmptyGlyphs(cffFont([bytes(ENDCHAR)]), 3)).toBeNull();
  });
});

describe("findEmptyGlyphs: files it does not understand", () => {
  it("gives null for other signatures (collections, WOFF, garbage)", () => {
    expect(findEmptyGlyphs(buildSfnt(0x74746366, []), 1)).toBeNull(); // ttcf
    expect(findEmptyGlyphs(new ArrayBuffer(4), 1)).toBeNull();
    expect(findEmptyGlyphs(new ArrayBuffer(0), 0)).toBeNull();
  });

  it("gives null instead of throwing when tables point outside the file", () => {
    const font = new Uint8Array(trueTypeFont(false));
    // Make the first table record claim a huge length.
    font.set(u32(0x7fffffff), 12 + 12);
    expect(findEmptyGlyphs(font.buffer as ArrayBuffer, 5)).toBeNull();
  });
});
