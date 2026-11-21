import { describe, expect, it } from "vitest";
import { buildGridModel } from "../grid/model.ts";
import { codepointToCharacter, describeGlyph } from "./info.ts";
import { GLYPH_BLANK, GLYPH_DRAWN, GLYPH_UNDRAWN } from "./state.ts";

describe("codepointToCharacter", () => {
  it("converts BMP and astral code points", () => {
    expect(codepointToCharacter(0x4e00)).toBe("一");
    expect(codepointToCharacter(0x20000)).toBe("\u{20000}");
  });

  it("is null for an unmapped glyph (-1)", () => {
    expect(codepointToCharacter(-1)).toBeNull();
  });

  it("is null for lone surrogates, which are not characters", () => {
    expect(codepointToCharacter(0xd800)).toBeNull();
    expect(codepointToCharacter(0xdfff)).toBeNull();
  });

  it("is null past the end of Unicode", () => {
    expect(codepointToCharacter(0x110000)).toBeNull();
  });
});

describe("describeGlyph", () => {
  const model = buildGridModel({ 65: 1 }, 3);
  const box = {
    advance: 600,
    inkMinX: 50,
    inkMaxX: 540,
    inkMinY: -700,
    inkMaxY: 0,
  };

  it("describes a mapped item", () => {
    const info = describeGlyph(model, 0, box);

    expect(info.label).toBe("U+0041");
    expect(info.codepoint).toBe(0x41);
    expect(info.character).toBe("A");
    expect(info.glyphIndex).toBe(1);
    expect(info.advance).toBe(600);
  });

  it("computes the side bearings from the ink", () => {
    const info = describeGlyph(model, 0, box);

    expect(info.leftBearing).toBe(50);
    expect(info.rightBearing).toBe(60);
  });

  it("gives the bounding box with y up, as font tools show it", () => {
    expect(describeGlyph(model, 0, box).boundingBox).toEqual({
      xMin: 50,
      yMin: 0,
      xMax: 540,
      yMax: 700,
    });
  });

  it("has no bearings and no bounding box for a glyph without ink", () => {
    const empty = {
      advance: 250,
      inkMinX: 0,
      inkMaxX: 0,
      inkMinY: 0,
      inkMaxY: 0,
    };
    const info = describeGlyph(model, 0, empty);

    expect(info.leftBearing).toBeNull();
    expect(info.rightBearing).toBeNull();
    expect(info.boundingBox).toBeNull();
  });

  it("describes an unmapped glyph: no character, labelled by glyph index", () => {
    const info = describeGlyph(model, 1, box);

    expect(info.codepoint).toBe(-1);
    expect(info.character).toBeNull();
    expect(info.label).toBe("gid 0");
    expect(info.glyphIndex).toBe(0);
  });

  it("judges the state from the ink and the kind of the code point", () => {
    const none = {
      advance: 250,
      inkMinX: 0,
      inkMaxX: 0,
      inkMinY: 0,
      inkMaxY: 0,
    };
    // 'A' (ink expected): drawn with ink, undrawn without.
    expect(describeGlyph(model, 0, box).state).toBe(GLYPH_DRAWN);
    expect(describeGlyph(model, 0, none).state).toBe(GLYPH_UNDRAWN);
    // A space has nothing to draw; a glyph without a code point is not judged.
    const spaces = buildGridModel({ 32: 1 }, 3);
    expect(describeGlyph(spaces, 0, none).state).toBe(GLYPH_BLANK);
    expect(describeGlyph(model, 1, none).state).toBe(GLYPH_BLANK);
    // Controls and private use are not judged either.
    for (const codepoint of [0x0, 0xe000, 0x3164]) {
      const odd = buildGridModel(Object.fromEntries([[codepoint, 1]]), 3);
      expect(describeGlyph(odd, 0, none).state).toBe(GLYPH_BLANK);
    }
    expect(describeGlyph(model, 1, box).state).toBe(GLYPH_DRAWN);
  });
});
