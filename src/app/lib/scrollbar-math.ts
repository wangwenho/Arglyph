import { clamp } from "../../core/math.ts";
// The numbers of an overlay scrollbar: where its thumb is on its track, and the
// scroll position a thumb position stands for. Along one axis, in pixels.

/** A thumb is never smaller than this: it has to be grabbed. */
export const MIN_THUMB = 24;

export interface Thumb {
  size: number;
  /** From the start of the track. */
  offset: number;
}

/**
 * The thumb for content of `content` pixels seen through `view`, scrolled by
 * `scroll` (0 to content − view, from the start). null when everything fits.
 */
export function thumbFor(
  view: number,
  content: number,
  scroll: number,
  track: number,
): Thumb | null {
  if (content <= view + 1 || track <= 0) return null;
  const size = Math.min(track, Math.max(MIN_THUMB, (track * view) / content));
  const range = content - view;
  const free = track - size;
  const fraction = clamp(scroll / range, 0, 1);
  return { size, offset: free * fraction };
}

/** The scroll position (from the start) that puts the thumb at `offset` on the track. */
export function scrollFor(
  offset: number,
  view: number,
  content: number,
  track: number,
  thumbSize: number,
): number {
  const free = track - thumbSize;
  if (free <= 0) return 0;
  const range = content - view;
  return Math.min(range, Math.max(0, (offset / free) * range));
}
