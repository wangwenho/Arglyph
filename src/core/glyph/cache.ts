import type { Font } from "opentype.js";
import type { GlyphBox } from "./origin.ts";

/** A least-recently-used cache, keyed by glyph index. */
export class GlyphCache<T> {
  private readonly entries = new Map<number, T>();
  private readonly limit: number;
  private readonly build: (index: number) => T;
  private hits = 0;
  private misses = 0;

  constructor(limit: number, build: (index: number) => T) {
    this.limit = limit;
    this.build = build;
  }

  get(index: number): T {
    const cached = this.entries.get(index);
    if (cached !== undefined) {
      // Move the accessed entry to the end of the Map to mark it as recently used
      this.entries.delete(index);
      this.entries.set(index, cached);
      this.hits++;
      return cached;
    }

    this.misses++;
    const value = this.build(index);
    this.entries.set(index, value);
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }

  takeStats(): { hits: number; misses: number } {
    const stats = { hits: this.hits, misses: this.misses };
    this.hits = 0;
    this.misses = 0;
    return stats;
  }
}

/**
 * Everything the grid needs to draw one glyph, computed once on a cache miss.
 * Sizes are in font units; y points down. It depends on the glyph only, so
 * every code point that maps to the glyph shares it.
 */
export interface GlyphRenderData extends GlyphBox {
  path: Path2D;
}

export function buildGlyphRenderData(
  font: Font,
  index: number,
): GlyphRenderData {
  const glyph = font.glyphs.get(index);
  const outline = glyph.getPath(0, 0, font.unitsPerEm);
  const path = new Path2D();
  // opentype.js writes no closing command, and a CFF contour does not end where
  // it began. Filling closes a contour by itself; a stroke does not, so close
  // each one here: the outline layer of the zoom view draws the closing edge too.
  let open = false;
  for (const cmd of outline.commands) {
    switch (cmd.type) {
      case "M":
        if (open) path.closePath();
        open = true;
        path.moveTo(cmd.x, cmd.y);
        break;
      case "L":
        path.lineTo(cmd.x, cmd.y);
        break;
      case "C":
        path.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case "Q":
        path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;
      case "Z":
        path.closePath();
        open = false;
        break;
    }
  }
  if (open) path.closePath();

  // A glyph without outline (space) has an empty box: all four values are NaN.
  const box = outline.getBoundingBox();
  const hasInk = !box.isEmpty();
  return {
    path,
    advance: glyph.advanceWidth ?? 0,
    inkMinX: hasInk ? box.x1 : 0,
    inkMaxX: hasInk ? box.x2 : 0,
    inkMinY: hasInk ? box.y1 : 0,
    inkMaxY: hasInk ? box.y2 : 0,
  };
}
