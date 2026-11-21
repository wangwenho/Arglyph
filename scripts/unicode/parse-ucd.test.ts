import { describe, expect, it } from "vitest";
import {
  KIND_BLANK,
  KIND_INK,
  KIND_OPTIONAL,
  kindOfCategory,
  overrideKind,
  parseBlocks,
  parseDefaultIgnorable,
  parseUnicodeData,
} from "./parse-ucd.ts";

const HEADER = "# Blocks-18.0.0.txt\n# Date: 2026-07-08\n\n";

describe("parseBlocks", () => {
  it("reads ranges and names, skipping comments and blank lines", () => {
    const text = `${HEADER}# a comment\n0000..007F; Basic Latin\n\n0080..00FF; Latin-1 Supplement\n`;
    expect(parseBlocks(text, "18.0.0")).toEqual([
      { start: 0x0, end: 0x7f, name: "Basic Latin" },
      { start: 0x80, end: 0xff, name: "Latin-1 Supplement" },
    ]);
  });

  it("reads five- and six-digit code points and CRLF line endings", () => {
    const text = `${HEADER}20000..2A6DF; CJK Unified Ideographs Extension B\r\n100000..10FFFF; Supplementary Private Use Area-B\r\n`;
    const blocks = parseBlocks(text);
    expect(blocks[0]).toEqual({
      start: 0x20000,
      end: 0x2a6df,
      name: "CJK Unified Ideographs Extension B",
    });
    expect(blocks[1].end).toBe(0x10ffff);
  });

  it("rejects a header for another version", () => {
    expect(() => parseBlocks(`${HEADER}0000..007F; X\n`, "17.0.0")).toThrow(
      /expected the header/,
    );
  });

  it("rejects overlapping or descending blocks", () => {
    expect(() =>
      parseBlocks(`${HEADER}0000..00FF; A\n0080..017F; B\n`),
    ).toThrow(/overlaps or precedes A/);
    expect(() =>
      parseBlocks(`${HEADER}0100..01FF; A\n0000..00FF; B\n`),
    ).toThrow(/overlaps or precedes A/);
  });

  it("rejects a block that is not aligned to 16 code points", () => {
    expect(() => parseBlocks(`${HEADER}0001..007F; A\n`)).toThrow(/aligned/);
    expect(() => parseBlocks(`${HEADER}0000..0070; A\n`)).toThrow(/aligned/);
  });

  it("rejects a range that leaves the code space or runs backwards", () => {
    expect(() => parseBlocks(`${HEADER}110000..11000F; A\n`)).toThrow(
      /bad range/,
    );
    expect(() => parseBlocks(`${HEADER}0080..000F; A\n`)).toThrow(/bad range/);
  });
});

describe("parseUnicodeData", () => {
  const line = (cp: string, name: string, gc: string) =>
    `${cp};${name};${gc};0;L;;;;;N;;;;;\n`;

  it("merges neighbours of the same kind into runs and leaves gaps", () => {
    const text =
      line("0041", "LATIN CAPITAL LETTER A", "Lu") +
      line("0042", "LATIN CAPITAL LETTER B", "Lu") +
      line("0043", "DIGIT", "Nd") + // ink as well: merged
      line("0044", "SOME MARK", "Mn") + // blank: new run
      line("0046", "AFTER A GAP", "Lu");
    expect(parseUnicodeData(text)).toEqual([
      { start: 0x41, end: 0x43, kind: KIND_INK },
      { start: 0x44, end: 0x44, kind: KIND_BLANK },
      { start: 0x46, end: 0x46, kind: KIND_INK },
    ]);
  });

  it("expands First/Last pairs into one range", () => {
    const text =
      line("4DFF", "BEFORE", "So") +
      line("4E00", "<CJK Ideograph, First>", "Lo") +
      line("9FFF", "<CJK Ideograph, Last>", "Lo") +
      line("A000", "YI SYLLABLE IT", "Lo");
    expect(parseUnicodeData(text)).toEqual([
      { start: 0x4dff, end: 0xa000, kind: KIND_INK },
    ]);
  });

  it("classifies surrogates, private use and controls as optional", () => {
    const text =
      line("D800", "<Surrogate, First>", "Cs") +
      line("DFFF", "<Surrogate, Last>", "Cs");
    expect(parseUnicodeData(text)).toEqual([
      { start: 0xd800, end: 0xdfff, kind: KIND_OPTIONAL },
    ]);
    expect(kindOfCategory("Cc")).toBe(KIND_OPTIONAL);
  });

  it("maps every general category to a kind and rejects unknown ones", () => {
    for (const gc of ["Lu", "Mc", "Nd", "Po", "Sm"]) {
      expect(kindOfCategory(gc)).toBe(KIND_INK);
    }
    for (const gc of ["Zs", "Zl", "Zp", "Cf", "Mn", "Me"]) {
      expect(kindOfCategory(gc)).toBe(KIND_BLANK);
    }
    for (const gc of ["Cc", "Cs", "Co"]) {
      expect(kindOfCategory(gc)).toBe(KIND_OPTIONAL);
    }
    expect(() => kindOfCategory("Xx")).toThrow(/unknown general category/);
    expect(() => parseUnicodeData(line("0041", "A", "Xx"))).toThrow(/unknown/);
  });

  it("rejects lines out of order, unmatched ranges and garbage", () => {
    expect(() =>
      parseUnicodeData(line("0042", "B", "Lu") + line("0041", "A", "Lu")),
    ).toThrow(/out of order/);
    expect(() => parseUnicodeData(line("4E00", "<CJK, First>", "Lo"))).toThrow(
      /unclosed range/,
    );
    expect(() => parseUnicodeData(line("9FFF", "<CJK, Last>", "Lo"))).toThrow(
      /without a matching/,
    );
    expect(() =>
      parseUnicodeData(
        line("4E00", "<CJK, First>", "Lo") + line("4E01", "X", "Lo"),
      ),
    ).toThrow(/not closed/);
    expect(() => parseUnicodeData("not a line\n")).toThrow(/cannot parse/);
    expect(() => parseUnicodeData("")).toThrow(/no characters/);
  });
});

describe("parseDefaultIgnorable", () => {
  const header = "# DerivedCoreProperties-18.0.0.txt\n# Date: x\n\n";
  const text =
    header +
    "# Derived Property: Alphabetic\n0041..005A    ; Alphabetic # L&  [26] A..Z\n" +
    "00AD          ; Default_Ignorable_Code_Point # Cf       SOFT HYPHEN\n" +
    "115F..1160    ; Default_Ignorable_Code_Point # Lo   [2] HANGUL CHOSEONG FILLER..X\n" +
    "E0100..E01EF  ; Default_Ignorable_Code_Point # Mn [240] VARIATION SELECTOR-17..X\n";

  it("reads only the Default_Ignorable_Code_Point lines, singles and ranges", () => {
    expect(parseDefaultIgnorable(text, "18.0.0")).toEqual([
      [0xad, 0xad],
      [0x115f, 0x1160],
      [0xe0100, 0xe01ef],
    ]);
  });

  it("rejects another version, a bad range, and a file without the property", () => {
    expect(() => parseDefaultIgnorable(text, "17.0.0")).toThrow(
      /expected the header/,
    );
    expect(() =>
      parseDefaultIgnorable(
        `${header}1160..115F ; Default_Ignorable_Code_Point # Lo\n`,
      ),
    ).toThrow(/bad range/);
    expect(() => parseDefaultIgnorable(header)).toThrow(/no Default_Ignorable/);
  });
});

describe("overrideKind", () => {
  const run = (start: number, end: number, kind: number) => ({
    start,
    end,
    kind,
  });

  it("splits a run around the code points it changes", () => {
    expect(
      overrideKind(
        [run(0x3100, 0x3200, KIND_INK)],
        [[0x3164, 0x3164]],
        KIND_BLANK,
      ),
    ).toEqual([
      run(0x3100, 0x3163, KIND_INK),
      run(0x3164, 0x3164, KIND_BLANK),
      run(0x3165, 0x3200, KIND_INK),
    ]);
  });

  it("leaves unassigned code points unassigned", () => {
    const runs = [run(0x10, 0x1f, KIND_INK), run(0x40, 0x4f, KIND_INK)];
    expect(overrideKind(runs, [[0x20, 0x3f]], KIND_BLANK)).toEqual(runs);
  });

  it("merges with a neighbour of the new kind, and handles overlapping ranges", () => {
    const runs = [run(0x10, 0x1f, KIND_BLANK), run(0x20, 0x2f, KIND_INK)];
    expect(
      overrideKind(
        runs,
        [
          [0x20, 0x2a],
          [0x25, 0x2f],
        ],
        KIND_BLANK,
      ),
    ).toEqual([run(0x10, 0x2f, KIND_BLANK)]);
  });

  it("changes the ends of a run and the whole of it", () => {
    expect(
      overrideKind(
        [run(0x10, 0x1f, KIND_INK)],
        [
          [0x0, 0x12],
          [0x1e, 0x40],
        ],
        KIND_BLANK,
      ),
    ).toEqual([
      run(0x10, 0x12, KIND_BLANK),
      run(0x13, 0x1d, KIND_INK),
      run(0x1e, 0x1f, KIND_BLANK),
    ]);
    expect(
      overrideKind([run(0x10, 0x1f, KIND_INK)], [[0x0, 0x40]], KIND_BLANK),
    ).toEqual([run(0x10, 0x1f, KIND_BLANK)]);
  });
});
