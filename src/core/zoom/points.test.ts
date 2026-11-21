import type { PathCommand } from "opentype.js";
import { describe, expect, it } from "vitest";
import { extractPoints } from "./points.ts";

const M = (x: number, y: number): PathCommand => ({ type: "M", x, y });
const L = (x: number, y: number): PathCommand => ({ type: "L", x, y });
const Q = (x1: number, y1: number, x: number, y: number): PathCommand => ({
  type: "Q",
  x1,
  y1,
  x,
  y,
});
const C = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): PathCommand => ({ type: "C", x1, y1, x2, y2, x, y });
const Z: PathCommand = { type: "Z" };

const list = (values: Float64Array) => Array.from(values);

describe("extractPoints", () => {
  it("has nothing for a glyph without outline", () => {
    const points = extractPoints([]);
    expect(points.contours).toBe(0);
    expect(list(points.onCurve)).toEqual([]);
    expect(list(points.offCurve)).toEqual([]);
    expect(list(points.handles)).toEqual([]);
  });

  it("reads a polygon: only on-curve points, no handles", () => {
    const points = extractPoints([M(0, 0), L(10, 0), L(10, 10), Z]);
    expect(points.contours).toBe(1);
    expect(list(points.onCurve)).toEqual([0, 0, 10, 0, 10, 10]);
    expect(list(points.offCurve)).toEqual([]);
    expect(list(points.handles)).toEqual([]);
  });

  it("does not repeat the first point when the contour comes back to it", () => {
    const points = extractPoints([M(0, 0), L(10, 0), L(10, 10), L(0, 0), Z]);
    expect(list(points.onCurve)).toEqual([0, 0, 10, 0, 10, 10]);
  });

  it("skips a line that goes nowhere (a TrueType contour begins with one)", () => {
    const points = extractPoints([M(5, 5), L(5, 5), L(10, 5), Z]);
    expect(list(points.onCurve)).toEqual([5, 5, 10, 5]);
  });

  it("reads a quadratic curve: one off-curve point, a handle to each side", () => {
    const points = extractPoints([M(0, 0), Q(5, 10, 10, 0), Z]);
    expect(list(points.onCurve)).toEqual([0, 0, 10, 0]);
    expect(list(points.offCurve)).toEqual([5, 10]);
    expect(list(points.handles)).toEqual([0, 0, 5, 10, 5, 10, 10, 0]);
  });

  it("reads a cubic curve: two off-curve points, each joined to its own end", () => {
    const points = extractPoints([M(0, 0), C(0, 5, 10, 5, 10, 0), Z]);
    expect(list(points.onCurve)).toEqual([0, 0, 10, 0]);
    expect(list(points.offCurve)).toEqual([0, 5, 10, 5]);
    expect(list(points.handles)).toEqual([0, 0, 0, 5, 10, 5, 10, 0]);
  });

  it("counts every contour, and keeps the first point of each", () => {
    const points = extractPoints([
      M(0, 0),
      L(4, 0),
      L(4, 4),
      Z,
      M(1, 1),
      L(2, 1),
      L(1, 1),
      Z,
    ]);
    expect(points.contours).toBe(2);
    expect(list(points.onCurve)).toEqual([0, 0, 4, 0, 4, 4, 1, 1, 2, 1]);
  });

  it("ends a contour at the next M and at the end: opentype.js writes no Z", () => {
    const points = extractPoints([
      M(0, 0),
      L(4, 0),
      L(4, 4),
      L(0, 0),
      M(1, 1),
      L(2, 1),
      L(2, 2),
      L(1, 1),
    ]);
    expect(points.contours).toBe(2);
    expect(list(points.onCurve)).toEqual([0, 0, 4, 0, 4, 4, 1, 1, 2, 1, 2, 2]);
  });

  it("keeps a contour of a single point", () => {
    expect(list(extractPoints([M(3, 4), Z]).onCurve)).toEqual([3, 4]);
  });
});
