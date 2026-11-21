import { clamp } from "../../core/math.ts";
// How wide the inspector may be: the width the user dragged it to, kept where
// the glyphs still have room.

export const DEFAULT_INSPECTOR_WIDTH = 300;
export const MIN_INSPECTOR_WIDTH = 240;
export const MAX_INSPECTOR_WIDTH = 480;
/** The grid or the text keeps at least this much, whatever the inspector asks for. */
export const MIN_STAGE_WIDTH = 320;

/**
 * `width` kept between the smallest and the biggest the inspector may be in a body
 * `bodyWidth` wide. The smallest wins when the body is too narrow for both.
 */
export function clampInspectorWidth(width: number, bodyWidth: number): number {
  const biggest = Math.max(
    MIN_INSPECTOR_WIDTH,
    Math.min(MAX_INSPECTOR_WIDTH, bodyWidth - MIN_STAGE_WIDTH),
  );
  return Math.round(clamp(width, MIN_INSPECTOR_WIDTH, biggest));
}
