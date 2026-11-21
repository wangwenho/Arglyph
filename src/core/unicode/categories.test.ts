import { describe, expect, it } from "vitest";
import { codepointKind, expectedCount, isExpectedKind } from "./categories.ts";

describe("codepointKind", () => {
  it("is ink for letters, digits, punctuation, symbols and ideographs", () => {
    expect(codepointKind(0x41)).toBe("ink");
    expect(codepointKind(0x31)).toBe("ink");
    expect(codepointKind(0x21)).toBe("ink");
    expect(codepointKind(0x20ac)).toBe("ink"); // euro sign
    expect(codepointKind(0x4e00)).toBe("ink");
    expect(codepointKind(0x9fff)).toBe("ink");
    expect(codepointKind(0x20000)).toBe("ink");
    expect(codepointKind(0x3042)).toBe("ink"); // hiragana
  });

  it("is blank for spaces, format characters and marks", () => {
    expect(codepointKind(0x20)).toBe("blank"); // space
    expect(codepointKind(0x3000)).toBe("blank"); // ideographic space
    expect(codepointKind(0x200d)).toBe("blank"); // zero width joiner (Cf)
    expect(codepointKind(0xfe0f)).toBe("blank"); // variation selector 16 (Mn)
    expect(codepointKind(0xe0100)).toBe("blank"); // variation selector 17 (Mn)
  });

  it("is blank for the characters that are invisible by design, whatever their category", () => {
    // Letters (Lo) by category, but Default_Ignorable: the Hangul fillers.
    for (const cp of [0x115f, 0x1160, 0x3164, 0xffa0]) {
      expect(codepointKind(cp)).toBe("blank");
    }
    expect(codepointKind(0x2800)).toBe("blank"); // braille pattern blank (So)
    expect(codepointKind(0x2801)).toBe("ink"); // a braille cell with a dot
    expect(codepointKind(0x00ad)).toBe("blank"); // soft hyphen
    expect(codepointKind(0xe0020)).toBe("blank"); // tag space
  });

  it("is optional for controls, private use and surrogates", () => {
    expect(codepointKind(0x0)).toBe("optional");
    expect(codepointKind(0x1f)).toBe("optional");
    expect(codepointKind(0x7f)).toBe("optional");
    expect(codepointKind(0x85)).toBe("optional");
    expect(codepointKind(0xe000)).toBe("optional");
    expect(codepointKind(0xf8ff)).toBe("optional");
    expect(codepointKind(0xd800)).toBe("optional");
    expect(codepointKind(0xdfff)).toBe("optional");
    expect(codepointKind(0xf0000)).toBe("optional");
    expect(codepointKind(0x10fffd)).toBe("optional");
  });

  it("is unassigned for the rest, including noncharacters and out of range", () => {
    expect(codepointKind(0x378)).toBe("unassigned");
    expect(codepointKind(0xfffe)).toBe("unassigned");
    expect(codepointKind(0xffff)).toBe("unassigned");
    expect(codepointKind(0x10ffff)).toBe("unassigned");
    expect(codepointKind(0x110000)).toBe("unassigned");
    expect(codepointKind(0xe0080)).toBe("unassigned");
  });
});

describe("expectedCount", () => {
  it("counts the characters a font is expected to have", () => {
    // Basic Latin: 128 code points, 33 of them controls (U+0000..1F and U+007F).
    expect(expectedCount(0x0, 0x7f)).toBe(95);
    expect(expectedCount(0x378, 0x379)).toBe(0); // unassigned
    expect(expectedCount(0x41, 0x41)).toBe(1);
    expect(expectedCount(0x41, 0x40)).toBe(0);
  });

  it("knows the CJK blocks, which are fully assigned and all ink", () => {
    expect(expectedCount(0x4e00, 0x9fff)).toBe(20992);
    expect(expectedCount(0x3400, 0x4dbf)).toBe(6592);
    expect(expectedCount(0x20000, 0x2a6df)).toBe(42720);
  });

  it("is 0 for private use and surrogates, which no font has to have", () => {
    expect(expectedCount(0xd800, 0xdfff)).toBe(0);
    expect(expectedCount(0xe000, 0xf8ff)).toBe(0);
    expect(expectedCount(0xf0000, 0xfffff)).toBe(0);
  });

  it("matches a code point by code point count", () => {
    for (const [first, last] of [
      [0x0, 0x2ff],
      [0x2e80, 0x3100],
      [0xfdd0, 0xfdff],
      [0xfff0, 0x10010],
      [0xd7f0, 0xe010],
    ]) {
      let expected = 0;
      for (let cp = first; cp <= last; cp++) {
        if (isExpectedKind(codepointKind(cp))) expected++;
      }
      expect(expectedCount(first, last)).toBe(expected);
    }
  });
});
