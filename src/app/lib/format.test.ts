import { expect, it } from "vitest";
import { formatCount, plural } from "./format.ts";

it("writes counts with a comma, whatever the locale", () => {
  expect(formatCount(20950)).toBe("20,950");
  expect(formatCount(7)).toBe("7");
});

it("makes a noun plural from its count", () => {
  expect(plural(1, "result")).toBe("1 result");
  expect(plural(0, "result")).toBe("0 results");
  expect(plural(1024, "glyph")).toBe("1,024 glyphs");
});
