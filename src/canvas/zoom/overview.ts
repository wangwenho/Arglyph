// The overview in the corner of the zoom view (geometry: core/zoom/overview.ts).
//
// It shows up only when part of the glyph is out of view, and a click or a drag
// on it moves the view there.

import {
  centerOnOverviewPoint,
  type OverviewInput,
  type OverviewLayout,
  overviewLayout,
} from "../../core/zoom/overview.ts";
import type { ViewTransform } from "../../core/zoom/view-transform.ts";
import type { Palette } from "../theme.ts";

export interface OverviewHost {
  /** What the view shows now; null when there is nothing to show. */
  input(): OverviewInput | null;
  /** The glyph's outline in font units, or null when the font has none. */
  path(): Path2D | null;
  palette(): Palette;
  /** The user picked a place in the overview. */
  moveTo(transform: ViewTransform): void;
}

export interface Overview {
  /** Redraw, or hide the overview when it is of no use. */
  update(): void;
  dispose(): void;
}

export function attachOverview(
  canvas: HTMLCanvasElement,
  host: OverviewHost,
): Overview {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is not available");
  const ctx: CanvasRenderingContext2D = context;
  let layout: OverviewLayout | null = null;
  let dragging: number | null = null;

  function update() {
    const input = host.input();
    layout = input ? overviewLayout(input) : null;
    canvas.hidden = !layout?.needed;
    if (!layout?.needed) return;

    const ratio = window.devicePixelRatio || 1;
    const { width, height } = layout;
    // Resizing a canvas clears it and costs; only when the size changed.
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
    }
    if (canvas.height !== Math.round(height * ratio)) {
      canvas.height = Math.round(height * ratio);
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(layout, host.palette(), host.path());
  }

  function paint(l: OverviewLayout, palette: Palette, path: Path2D | null) {
    ctx.clearRect(0, 0, l.width, l.height);
    ctx.fillStyle = palette.cardFill;
    ctx.fillRect(0, 0, l.width, l.height);

    // The em square, as in the zoom view.
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.squareStroke;
    ctx.strokeRect(
      Math.round(l.square.left) + 0.5,
      Math.round(l.square.top) + 0.5,
      l.square.right - l.square.left,
      l.square.bottom - l.square.top,
    );

    if (path) {
      ctx.save();
      ctx.translate(l.originX, l.originY);
      ctx.scale(l.scale, l.scale);
      ctx.fillStyle = palette.glyphFill;
      ctx.fill(path);
      ctx.restore();
    }

    // The part in view: lightly filled, so the glyph still shows through, and
    // outlined in the selection color.
    const { left, top, right, bottom } = l.viewport;
    ctx.fillStyle = palette.selectionStroke;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.selectionStroke;
    ctx.strokeRect(left, top, right - left, bottom - top);
  }

  function moveToEvent(event: PointerEvent) {
    const input = host.input();
    if (!input || !layout) return;
    const rect = canvas.getBoundingClientRect();
    host.moveTo(
      centerOnOverviewPoint(
        input,
        layout,
        event.clientX - rect.left,
        event.clientY - rect.top,
      ),
    );
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    moveToEvent(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === dragging) moveToEvent(event);
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (event.pointerId === dragging) dragging = null;
  };
  // The keys stay with the zoom view: a click here must not take the focus.
  const keepFocus = (event: MouseEvent) => event.preventDefault();
  // The wheel over the overview must not scroll or zoom what is behind it.
  const onWheel = (event: WheelEvent) => event.preventDefault();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("mousedown", keepFocus);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    update,
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("mousedown", keepFocus);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
