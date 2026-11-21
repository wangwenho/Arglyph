import { expect, it } from "vitest";
import { clamp } from "./math.ts";

it("keeps a value inside the range, and the minimum wins when the range is upside down", () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-3, 0, 10)).toBe(0);
  expect(clamp(42, 0, 10)).toBe(10);
  expect(clamp(5, 8, 2)).toBe(8);
});
