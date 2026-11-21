import { describe, expect, it } from "vitest";
import { buildGridModel } from "./model.ts";

function items(model: ReturnType<typeof buildGridModel>) {
  return Array.from({ length: model.count }, (_, i) => [
    model.codepointAt(i),
    model.glyphIndexAt(i),
  ]);
}

describe("buildGridModel", () => {
  it("orders mapped items by code point, whatever the cmap order", () => {
    const model = buildGridModel({ 19968: 3, 65: 1, 32: 2 }, 4);

    expect(items(model).slice(0, 3)).toEqual([
      [0x20, 2],
      [0x41, 1],
      [0x4e00, 3],
    ]);
  });

  it("puts glyphs without a code point last, in glyph order", () => {
    const model = buildGridModel({ 65: 2 }, 5);

    expect(items(model)).toEqual([
      [0x41, 2],
      [-1, 0],
      [-1, 1],
      [-1, 3],
      [-1, 4],
    ]);
    expect(model.count).toBe(5);
  });

  it("lists a glyph once per code point that maps to it", () => {
    // Noto-style compatibility ideographs: two code points, one glyph
    const model = buildGridModel({ 19968: 1, 63744: 1 }, 2);

    expect(items(model)).toEqual([
      [0x4e00, 1],
      [0xf900, 1],
      [-1, 0],
    ]);
    expect(model.count).toBe(3);
  });

  it("does not list a glyph without a code point when another code point has it", () => {
    const model = buildGridModel({ 65: 0 }, 1);
    expect(items(model)).toEqual([[0x41, 0]]);
  });

  it("ignores cmap entries that point outside the font", () => {
    const model = buildGridModel({ 65: 1, 66: 99, 67: -1 }, 2);

    expect(items(model)).toEqual([
      [0x41, 1],
      [-1, 0],
    ]);
  });

  it("handles code points outside the BMP", () => {
    const model = buildGridModel({ 131072: 1, 65: 2 }, 3);

    expect(model.codepointAt(1)).toBe(0x20000);
    expect(model.glyphIndexAt(1)).toBe(1);
  });

  it("handles an empty cmap and an empty font", () => {
    expect(items(buildGridModel({}, 2))).toEqual([
      [-1, 0],
      [-1, 1],
    ]);
    expect(buildGridModel({}, 0).count).toBe(0);
  });
});
