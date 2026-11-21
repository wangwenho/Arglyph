import { describe, expect, it } from "vitest";
import type { GridModel } from "../../core/grid/model.ts";
import { GLYPH_MENU_SECTION } from "../../protocol.ts";
import { glyphMenuContext } from "./glyph-context.ts";

// Only what glyphMenuContext asks of a model.
const model = (codepoints: number[]) =>
  ({
    count: codepoints.length,
    codepointAt: (index: number) => codepoints[index],
  }) as unknown as GridModel;

const parse = (json: string) => JSON.parse(json) as Record<string, unknown>;

describe("glyphMenuContext", () => {
  it("offers the code point and the character of a mapped glyph", () => {
    expect(parse(glyphMenuContext(model([0x41, 0x4e00]), 1))).toEqual({
      webviewSection: GLYPH_MENU_SECTION,
      codePoint: "U+4E00",
      character: "一",
      "arglyph.hasCharacter": true,
      preventDefaultContextMenuItems: true,
    });
  });

  it("pads the code point to four digits and does not break above the BMP", () => {
    expect(parse(glyphMenuContext(model([0x41]), 0)).codePoint).toBe("U+0041");
    const context = parse(glyphMenuContext(model([0x20000]), 0));
    expect(context.codePoint).toBe("U+20000");
    expect(context.character).toBe("\u{20000}");
  });

  it("offers only the code point where there is no character on its own", () => {
    // A lone surrogate is a code point, but not a character.
    const context = parse(glyphMenuContext(model([0xd800]), 0));
    expect(context.codePoint).toBe("U+D800");
    expect(context["arglyph.hasCharacter"]).toBe(false);
    expect("character" in context).toBe(false);
  });

  it("has no entries over a glyph without a code point, over nothing, or with no model", () => {
    const empty = { preventDefaultContextMenuItems: true };
    expect(parse(glyphMenuContext(model([-1]), 0))).toEqual(empty);
    expect(parse(glyphMenuContext(model([0x41]), -1))).toEqual(empty);
    expect(parse(glyphMenuContext(model([0x41]), 5))).toEqual(empty);
    expect(parse(glyphMenuContext(null, 0))).toEqual(empty);
  });
});
