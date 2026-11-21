import { describe, expect, it } from "vitest";
import {
  clampInspectorWidth,
  MAX_INSPECTOR_WIDTH,
  MIN_INSPECTOR_WIDTH,
} from "./inspector-width.ts";

describe("clampInspectorWidth", () => {
  it("keeps a width that is allowed", () => {
    expect(clampInspectorWidth(300, 1200)).toBe(300);
  });

  it("keeps it between the smallest and the biggest", () => {
    expect(clampInspectorWidth(100, 1200)).toBe(MIN_INSPECTOR_WIDTH);
    expect(clampInspectorWidth(900, 1200)).toBe(MAX_INSPECTOR_WIDTH);
  });

  it("leaves the glyphs their room: a narrow body gives the inspector less", () => {
    expect(clampInspectorWidth(480, 700)).toBe(380);
  });

  it("is never under the smallest, even in a body too narrow for both", () => {
    expect(clampInspectorWidth(400, 400)).toBe(MIN_INSPECTOR_WIDTH);
  });

  it("is a whole number of pixels", () => {
    expect(clampInspectorWidth(300.6, 1200)).toBe(301);
  });
});
