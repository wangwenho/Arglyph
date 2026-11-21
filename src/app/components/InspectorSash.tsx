import type { KeyboardEvent, PointerEvent } from "react";
import { clamp } from "../../core/math.ts";
import {
  MAX_INSPECTOR_WIDTH,
  MIN_INSPECTOR_WIDTH,
} from "../lib/inspector-width.ts";
import { trackPointerDrag } from "../lib/pointer-drag.ts";

export interface InspectorSashProps {
  /** The width it has now. */
  width: number;
  /** The biggest the inspector may be now (it depends on the window). */
  max(): number;
  /** While dragging: show this width, nothing is kept yet. */
  onLive(width: number): void;
  /** The user let go, or used a key: keep this width. */
  onCommit(width: number): void;
  /** Double click: the usual width. */
  onReset(): void;
}

const KEY_STEP = 16;

// The edge between the glyphs and the inspector, which can be dragged (as VS
// Code's own panels can). It lies over the line that is already there, and shows
// a thicker one when the pointer is on it. It can be reached by keyboard, as a
// separator should: the arrows move it, a double click (or Enter) puts it back.
export function InspectorSash({
  width,
  max,
  onLive,
  onCommit,
  onReset,
}: InspectorSashProps) {
  const within = (value: number) =>
    Math.round(clamp(value, MIN_INSPECTOR_WIDTH, max()));

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const sash = event.currentTarget;
    sash.dataset.dragging = "true";
    const startX = event.clientX;
    const startWidth = width;
    let last = startWidth;
    trackPointerDrag(sash, event.nativeEvent, {
      move(e) {
        // The inspector is on the right: dragging left makes it wider.
        last = within(startWidth + startX - e.clientX);
        onLive(last);
      },
      end() {
        delete sash.dataset.dragging;
        onCommit(last);
      },
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") onCommit(within(width + KEY_STEP));
    else if (event.key === "ArrowRight") onCommit(within(width - KEY_STEP));
    else if (event.key === "Enter") onReset();
    else return;
    event.preventDefault();
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> cannot be focused or dragged
    <div
      className="inspector-sash"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the inspector"
      aria-valuenow={width}
      aria-valuemin={MIN_INSPECTOR_WIDTH}
      aria-valuemax={MAX_INSPECTOR_WIDTH}
      tabIndex={0}
      data-tip="Drag to resize, or double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
