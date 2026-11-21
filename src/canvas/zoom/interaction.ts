// Pointer and keyboard handling for the zoom view.
//
//   wheel / pinch   zoom around the pointer
//   drag            move the glyph
//   double-click    fit the whole em square again
//   + - 0           zoom in, out, fit (also with Cmd or Ctrl)
//   left / right    the previous and the next glyph
//   Space, Escape   back to the grid
//   F O G B         toggle a layer (see core/zoom/layers.ts)

import { layerOfKey, type ZoomLayer } from "../../core/zoom/layers.ts";

/** What one step of a key zooms by. */
const KEY_ZOOM_STEP = 1.25;
/** How fast the wheel zooms: a notch (about 100 units) is a factor of 1.16. */
const WHEEL_SPEED = 0.0015;
/** A pinch on a trackpad arrives as a wheel with Ctrl and much smaller steps. */
const PINCH_SPEED = 0.01;
/** Pixels a line or page of a wheel is worth. */
const LINE_HEIGHT = 16;

/** What the interaction needs from the view. The view owns all the state. */
export interface ZoomInteractionHost {
  container: HTMLElement;
  panBy(dx: number, dy: number): void;
  /** Zoom by `factor` around a point of the view (pixels from its top left). */
  zoomAround(x: number, y: number, factor: number): void;
  zoomAroundCenter(factor: number): void;
  fit(): void;
  navigate(delta: -1 | 1): void;
  close(): void;
  toggleLayer(layer: ZoomLayer): void;
}

/**
 * The zoom a key asks for, or null when the key is not a zoom key. The key
 * itself decides, not Shift: "+" needs Shift on most keyboards.
 */
function zoomKey(event: KeyboardEvent): "in" | "out" | "fit" | null {
  // With Cmd or Ctrl or without; Alt is somebody else's.
  if (event.altKey) return null;
  switch (event.key) {
    case "+":
    case "=":
      return "in";
    case "-":
    case "_":
      return "out";
    case "0":
      return "fit";
    default:
      return null;
  }
}

/**
 * A key the view has dealt with. Stopping the event, not only its default, is
 * what keeps VS Code out of it: a webview forwards every key to the editor from
 * a listener on its window, whatever preventDefault did, so Cmd+= would zoom
 * the whole window and Cmd+0 would move the focus to the sidebar as well. The
 * view is below that listener, so the event never reaches it.
 */
function consume(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** Start handling the pointer and keys on the zoom view. Returns the way to stop. */
export function attachZoomInteraction(host: ZoomInteractionHost): () => void {
  const { container } = host;
  // The container needs a tabindex to receive key events at all.
  container.tabIndex = 0;

  const stops: (() => void)[] = [];
  function listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) {
    container.addEventListener(type, handler, options);
    stops.push(() => container.removeEventListener(type, handler, options));
  }

  /** A point of the pointer event, in pixels from the top left of the container. */
  function local(event: MouseEvent): { x: number; y: number } {
    const rect = container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // Not passive: the page must not scroll or zoom under the glyph.
  listen(
    "wheel",
    (event) => {
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? LINE_HEIGHT
          : event.deltaMode === 2
            ? container.clientHeight
            : 1;
      const speed = event.ctrlKey ? PINCH_SPEED : WHEEL_SPEED;
      const { x, y } = local(event);
      host.zoomAround(x, y, Math.exp(-event.deltaY * unit * speed));
    },
    { passive: false },
  );

  let dragging: { id: number; x: number; y: number } | null = null;

  listen("pointerdown", (event) => {
    // The view takes the keys, so a click anywhere in it lets Esc and the
    // arrows work again.
    container.focus({ preventScroll: true });
    if (event.button !== 0 && event.button !== 1) return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    container.setPointerCapture(event.pointerId);
    container.style.cursor = "grabbing";
  });

  listen("pointermove", (event) => {
    if (!dragging || event.pointerId !== dragging.id) return;
    host.panBy(event.clientX - dragging.x, event.clientY - dragging.y);
    dragging.x = event.clientX;
    dragging.y = event.clientY;
  });

  function endDrag(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragging.id) return;
    dragging = null;
    container.style.cursor = "";
  }
  listen("pointerup", endDrag);
  listen("pointercancel", endDrag);

  listen("dblclick", () => host.fit());

  listen("keydown", (event) => {
    const zoom = zoomKey(event);
    if (zoom) {
      consume(event);
      if (zoom === "fit") host.fit();
      else
        host.zoomAroundCenter(
          zoom === "in" ? KEY_ZOOM_STEP : 1 / KEY_ZOOM_STEP,
        );
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;

    if (event.key === "Escape" || event.key === " ") {
      consume(event);
      host.close();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      consume(event);
      host.navigate(event.key === "ArrowLeft" ? -1 : 1);
    } else {
      const layer = layerOfKey(event.key);
      if (layer) {
        consume(event);
        host.toggleLayer(layer);
      }
    }
  });

  return () => {
    for (const stop of stops) stop();
    container.style.cursor = "";
  };
}
