import type { Font } from "opentype.js";
import { useEffect, useRef } from "react";
import { paintGlyph } from "../../canvas/glyph-painter.ts";
import { computeGlyphMetrics } from "../../core/font/metrics.ts";
import type { GlyphRenderData } from "../../core/glyph/cache.ts";
import { DEFAULT_LAYERS } from "../../core/zoom/layers.ts";
import { fitTransform } from "../../core/zoom/view-transform.ts";
import { usePalette } from "../hooks/use-palette.ts";

// Keep in sync with `.glyph-preview` in styles/inspector.css.
const CANVAS_SIZE = 224;

// The glyph, small, in the inspector: the zoom view's painter with a fixed fit.
export function GlyphPreview({
  font,
  data,
}: {
  font: Font;
  data: GlyphRenderData;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const palette = usePalette();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(CANVAS_SIZE * ratio);
    canvas.height = Math.round(CANVAS_SIZE * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const unitsPerEm = font.unitsPerEm;
    // At a size of one em the scale is 1, so `ascent` is in font units.
    const { ascent: ascender } = computeGlyphMetrics(font, unitsPerEm);
    paintGlyph(ctx, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      transform: fitTransform({
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        unitsPerEm,
        ascender,
        glyph: data,
      }),
      data,
      points: null,
      unitsPerEm,
      ascender,
      verticals: null,
      layers: DEFAULT_LAYERS,
      palette,
    });
  }, [font, data, palette]);

  return <canvas className="glyph-preview" ref={canvasRef} />;
}
