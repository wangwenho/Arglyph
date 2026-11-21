import type { Font } from "opentype.js";
import {
  computeGlyphMetrics,
  type FontVerticals,
  readVerticals,
} from "../../core/font/metrics.ts";
import {
  buildGlyphRenderData,
  type GlyphRenderData,
} from "../../core/glyph/cache.ts";
import type { ZoomLayer, ZoomLayers } from "../../core/zoom/layers.ts";
import { buildGlyphPoints, type GlyphPoints } from "../../core/zoom/points.ts";
import {
  fitScale,
  fitTransform,
  panBy,
  resizeAround,
  type ViewTransform,
  zoomAt,
  zoomLimits,
} from "../../core/zoom/view-transform.ts";
import {
  type GlyphFrame,
  missingGlyphBox,
  paintGlyph,
} from "../glyph-painter.ts";
import { watchDevicePixelRatio } from "../pixel-ratio.ts";
import { getPalette, subscribePalette } from "../theme.ts";
import { attachZoomInteraction } from "./interaction.ts";
import { attachOverview } from "./overview.ts";

export interface ZoomElements {
  /** Takes the pointer and the keys; the canvas is inside it. */
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  /** The overview of the glyph, in a corner; shown only when part of the glyph is out of view. */
  overview: HTMLCanvasElement;
}

/** What the user asks for in the zoom view; the app decides what to do about it. */
export interface ZoomIntents {
  /** Show the glyph before (-1) or after (1) the current one. */
  navigate(delta: -1 | 1): void;
  close(): void;
  toggleLayer(layer: ZoomLayer): void;
}

/** How far the glyph is zoomed. */
export interface ZoomState {
  /** As a multiple of the zoom that fits the em square in the view. */
  zoom: number;
  /** Nobody has zoomed or moved it: it follows the glyph and the size of the view. */
  fitted: boolean;
}

export interface ZoomView {
  /**
   * Show glyph `glyphIndex` of `font` (-1: the font has none, only the layout lines).
   * If the user has zoomed or moved the glyph, that stays, so the same part of
   * the next glyph, or of the same glyph after the file changed, is in view.
   */
  show(font: Font, glyphIndex: number): void;
  setLayers(layers: ZoomLayers): void;
  /** Show the whole em square again. */
  fit(): void;
  /** Zoom by `factor` around the center of the view. */
  zoomBy(factor: number): void;
  focus(): void;
  /** Called when the zoom, or whether the view is fitted, changed. */
  setZoomObserver(observer: ((zoom: ZoomState) => void) | null): void;
  dispose(): void;
}

// This file owns the zoom view's state and decides when to draw. What a frame
// looks like is in ../glyph-painter.ts; what the pointer and keys do is in
// interaction.ts; where the glyph is, in core/zoom/view-transform.ts.
export function createZoomView(
  { container, canvas, overview: overviewCanvas }: ZoomElements,
  intents: ZoomIntents,
  initialLayers: ZoomLayers,
): ZoomView {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is not available");
  const ctx: CanvasRenderingContext2D = context;

  let font: Font | null = null;
  let data: GlyphRenderData | null = null;
  let glyphIndex = -1;
  // Built when the points layer is first on for a glyph: most glyphs are looked
  // at without it.
  let points: GlyphPoints | null = null;
  let unitsPerEm = 1000;
  let ascender = 800;
  let verticals: FontVerticals | null = null;
  let layers = initialLayers;
  let palette = getPalette();
  let width = 0;
  let height = 0;
  // null: fitted. The transform is then worked out for every frame, from the
  // glyph and the size of the view.
  let moved: ViewTransform | null = null;
  let notified: ZoomState | null = null;
  let observer: ((zoom: ZoomState) => void) | null = null;
  let scheduled = false;
  let frameHandle = 0;
  let disposed = false;

  function fitted(): ViewTransform {
    return fitTransform({
      width,
      height,
      unitsPerEm,
      ascender,
      glyph: data ?? missingGlyphBox(unitsPerEm),
    });
  }

  function transform(): ViewTransform {
    return moved ?? fitted();
  }

  function render() {
    scheduled = false;
    if (disposed || width === 0 || height === 0) return;
    const current = transform();
    if (layers.points && !points && font && data) {
      points = buildGlyphPoints(font, glyphIndex);
    }
    const frame: GlyphFrame = {
      width,
      height,
      transform: current,
      data,
      points,
      unitsPerEm,
      ascender,
      verticals,
      layers,
      palette,
      labels: true,
    };
    paintGlyph(ctx, frame);

    overview.update();

    const zoom = current.scale / fitScale(width, height, unitsPerEm);
    if (
      !notified ||
      notified.zoom !== zoom ||
      notified.fitted !== (moved === null)
    ) {
      notified = { zoom, fitted: moved === null };
      observer?.(notified);
    }
  }

  function requestRender() {
    if (scheduled || disposed) return;
    scheduled = true;
    frameHandle = requestAnimationFrame(render);
  }

  function zoomAround(x: number, y: number, factor: number) {
    if (width === 0) return;
    const limits = zoomLimits(fitScale(width, height, unitsPerEm));
    moved = zoomAt(transform(), x, y, factor, limits.min, limits.max);
    requestRender();
  }

  const overview = attachOverview(overviewCanvas, {
    input: () =>
      width === 0
        ? null
        : {
            width,
            height,
            transform: transform(),
            unitsPerEm,
            ascender,
            glyph: data ?? missingGlyphBox(unitsPerEm),
          },
    path: () => data?.path ?? null,
    palette: () => palette,
    moveTo(next) {
      moved = next;
      requestRender();
    },
  });

  const detachInteraction = attachZoomInteraction({
    container,
    panBy(dx, dy) {
      if (width === 0) return;
      moved = panBy(transform(), dx, dy);
      requestRender();
    },
    zoomAround,
    zoomAroundCenter: (factor) => zoomAround(width / 2, height / 2, factor),
    fit() {
      moved = null;
      requestRender();
    },
    navigate: (delta) => intents.navigate(delta),
    close: () => intents.close(),
    toggleLayer: (layer) => intents.toggleLayer(layer),
  });

  // The view changed size (the pane was dragged, the window resized, the
  // inspector opened) or the pixel ratio did.
  function layout() {
    if (disposed) return;
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    if (moved && width > 0) {
      moved = resizeAround(moved, newWidth - width, newHeight - height);
    }
    width = newWidth;
    height = newHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }

  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(container);
  const stopWatchingPixelRatio = watchDevicePixelRatio(layout);

  const unsubscribePalette = subscribePalette(() => {
    palette = getPalette();
    requestRender();
  });

  return {
    show(newFont, newGlyphIndex) {
      if (newFont !== font) {
        font = newFont;
        const metrics = computeGlyphMetrics(newFont, newFont.unitsPerEm);
        // A font with another em: the old position means nothing in it.
        if (newFont.unitsPerEm !== unitsPerEm) moved = null;
        unitsPerEm = newFont.unitsPerEm;
        // At a size of one em the scale is 1, so `ascent` is in font units.
        ascender = metrics.ascent;
        verticals = readVerticals(newFont);
      }
      glyphIndex = newGlyphIndex;
      data = glyphIndex >= 0 ? buildGlyphRenderData(newFont, glyphIndex) : null;
      points = null;
      requestRender();
    },
    setLayers(newLayers) {
      layers = newLayers;
      requestRender();
    },
    fit() {
      moved = null;
      requestRender();
    },
    zoomBy(factor) {
      zoomAround(width / 2, height / 2, factor);
    },
    focus() {
      container.focus({ preventScroll: true });
    },
    setZoomObserver(newObserver) {
      observer = newObserver;
      notified = null;
      requestRender();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameHandle);
      detachInteraction();
      overview.dispose();
      resizeObserver.disconnect();
      stopWatchingPixelRatio();
      unsubscribePalette();
      observer = null;
      data = null;
      font = null;
    },
  };
}
