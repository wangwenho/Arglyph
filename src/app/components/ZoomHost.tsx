import type { Font } from "opentype.js";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  createZoomView,
  type ZoomState,
  type ZoomView,
} from "../../canvas/zoom/view.ts";
import type { ZoomLayer, ZoomLayers } from "../../core/zoom/layers.ts";
import { keepFocus } from "../lib/keep-focus.ts";
import { modifierName } from "../lib/shortcuts.ts";

export interface ZoomHostProps {
  font: Font;
  /**
   * The glyph to show; -1 when the font has none for the selected item, and
   * null while the selection is being worked out (a reload): then the glyph
   * that is shown stays.
   */
  glyphIndex: number | null;
  /** What to call the glyph for a screen reader. */
  label: string;
  layers: ZoomLayers;
  onNavigate(delta: -1 | 1): void;
  onClose(): void;
  onToggleLayer(layer: ZoomLayer): void;
}

const ZOOM_STEP = 1.25;

function formatZoom({ zoom }: ZoomState): string {
  return `${zoom >= 10 ? Math.round(zoom) : zoom.toFixed(1)}×`;
}

// The zoom view is plain TypeScript (see canvas/zoom/view.ts); React
// provides its elements, tells it what to show, and draws the zoom controls.
// It lives as long as this component does, which is as long as the zoom view is
// open: closing it forgets where the user had moved the glyph.
export function ZoomHost({
  font,
  glyphIndex,
  label,
  layers,
  onNavigate,
  onClose,
  onToggleLayer,
}: ZoomHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overviewRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ZoomView | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ zoom: 1, fitted: true });

  // The view outlives renders, so it must call the newest callbacks: Effect
  // Events always see the latest.
  const navigate = useEffectEvent(onNavigate);
  const close = useEffectEvent(onClose);
  const toggleLayer = useEffectEvent(onToggleLayer);
  const firstLayers = useEffectEvent(() => layers);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const overview = overviewRef.current;
    if (!container || !canvas || !overview) return;
    const view = createZoomView(
      { container, canvas, overview },
      {
        navigate,
        close,
        toggleLayer,
      },
      firstLayers(),
    );
    view.setZoomObserver(setZoom);
    view.focus();
    viewRef.current = view;
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (glyphIndex !== null) viewRef.current?.show(font, glyphIndex);
  }, [font, glyphIndex]);

  useEffect(() => {
    viewRef.current?.setLayers(layers);
  }, [layers]);

  const mod = modifierName();
  return (
    <div className="zoom">
      {/* The glyph is drawn on a canvas: a screen reader gets the keys here and
          the glyph's name from the live region of the app. */}
      <div
        className="zoom-surface"
        ref={containerRef}
        role="application"
        aria-label={`${label}, zoomed in. Left and right arrow keys show the previous and next glyph, plus and minus zoom, Escape goes back.`}
      >
        <canvas ref={canvasRef} />
      </div>
      {/* Where the view is on the glyph, when part of it is out of view; a click
          or a drag on it moves the view. Drawn on a canvas, so the keys and the
          wheel are the way for a screen reader. */}
      <canvas className="zoom-overview" ref={overviewRef} hidden />
      {/* A mouse click on a button must not take the keyboard focus away from
          the view, or the keys would stop working. Tab still reaches them. */}
      <div
        className="zoom-bar"
        role="toolbar"
        aria-label="Zoom"
        onMouseDown={keepFocus}
      >
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom out"
          data-tip={`Zoom out (${mod}+Minus)`}
          onClick={() => viewRef.current?.zoomBy(1 / ZOOM_STEP)}
        >
          −
        </button>
        <span className="zoom-level" aria-live="off">
          {formatZoom(zoom)}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Zoom in"
          data-tip={`Zoom in (${mod}+Plus)`}
          onClick={() => viewRef.current?.zoomBy(ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="button zoom-fit"
          data-tip={`Fit the whole em square (${mod}+0, or double-click)`}
          disabled={zoom.fitted}
          onClick={() => viewRef.current?.fit()}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
