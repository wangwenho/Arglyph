import { describe, expect, it } from "vitest";
import { blockIndexOf, groupBlocksByPlane, unicodeBlocks } from "./blocks.ts";

function nameAt(codepoint: number): string | undefined {
  return unicodeBlocks[blockIndexOf(codepoint)]?.name;
}

describe("the generated block table", () => {
  it("is ascending, non-overlapping, and inside the code space", () => {
    for (const [i, block] of unicodeBlocks.entries()) {
      expect(block.start).toBeLessThanOrEqual(block.end);
      expect(block.end).toBeLessThanOrEqual(0x10ffff);
      if (i > 0) expect(block.start).toBeGreaterThan(unicodeBlocks[i - 1].end);
    }
  });

  it("contains the blocks a CJK font is about", () => {
    const sizes = new Map(
      unicodeBlocks.map((b) => [b.name, b.end - b.start + 1]),
    );
    expect(sizes.get("CJK Unified Ideographs")).toBe(20992);
    expect(sizes.get("CJK Unified Ideographs Extension A")).toBe(6592);
    expect(sizes.get("CJK Unified Ideographs Extension B")).toBe(42720);
    expect(sizes.get("Bopomofo")).toBe(48);
  });
});

describe("blockIndexOf", () => {
  it("finds the block of a code point, including both ends of a block", () => {
    expect(nameAt(0x41)).toBe("Basic Latin");
    expect(nameAt(0x0)).toBe("Basic Latin");
    expect(nameAt(0x7f)).toBe("Basic Latin");
    expect(nameAt(0x80)).toBe("Latin-1 Supplement");
    expect(nameAt(0x4e00)).toBe("CJK Unified Ideographs");
    expect(nameAt(0x9fff)).toBe("CJK Unified Ideographs");
    expect(nameAt(0x20000)).toBe("CJK Unified Ideographs Extension B");
    expect(nameAt(0x10ffff)).toBe("Supplementary Private Use Area-B");
  });

  it("returns -1 for a code point that lies in no block", () => {
    // Between Tags (E0000..E007F) and Variation Selectors Supplement (E0100..).
    expect(blockIndexOf(0xe0080)).toBe(-1);
    expect(blockIndexOf(0x110000)).toBe(-1);
  });

  it("agrees with a linear scan for every first and last code point", () => {
    for (const [i, block] of unicodeBlocks.entries()) {
      expect(blockIndexOf(block.start)).toBe(i);
      expect(blockIndexOf(block.end)).toBe(i);
    }
  });
});

describe("planes", () => {
  it("groups blocks by plane in order, keeping every block once", () => {
    const groups = groupBlocksByPlane(unicodeBlocks);
    expect(groups[0].plane).toBe(0);
    expect(groups[0].blocks[0].name).toBe("Basic Latin");
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i].plane).toBeGreaterThan(groups[i - 1].plane);
    }
    expect(groups.flatMap((g) => g.blocks)).toEqual(unicodeBlocks);
    const ext = groups.find((g) => g.plane === 2);
    expect(ext?.blocks.map((b) => b.name)).toContain(
      "CJK Unified Ideographs Extension B",
    );
  });
});
