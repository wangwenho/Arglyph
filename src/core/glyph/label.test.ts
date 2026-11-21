import { expect, it } from "vitest";
import { formatGlyphLabel } from "./label.ts";

it("labels a code point as U+ and at least four uppercase hex digits, and a glyph without one by index", () => {
  expect(formatGlyphLabel(0x4e00, 7)).toBe("U+4E00");
  expect(formatGlyphLabel(0x41, 7)).toBe("U+0041"); // padded
  expect(formatGlyphLabel(0x10ffff, 7)).toBe("U+10FFFF"); // not truncated
  expect(formatGlyphLabel(undefined, 51032)).toBe("gid 51032");
});
