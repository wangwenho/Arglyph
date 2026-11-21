// The numbers on the zoom view's rulers and the lines of its grid.
//
// A fixed step (every 100 units) would be a wall of numbers when zoomed out and
// a single one when zoomed in, so the step follows the zoom: the smallest of
// 1, 2 and 5 times a power of ten that keeps the marks a readable distance apart.
// Pure functions, so a test can check them.

/** The least distance between two numbered marks, in pixels. */
export const RULER_MIN_SPACING = 64;

/** The step, in font units, between numbered marks at `scale` pixels per unit. */
export function rulerStep(scale: number): number {
  const wanted = RULER_MIN_SPACING / scale;
  const power = 10 ** Math.floor(Math.log10(wanted));
  for (const factor of [1, 2, 5, 10]) {
    if (factor * power >= wanted) return factor * power;
  }
  return 10 * power;
}

/** The step between the small marks between two numbered ones. */
export function rulerMinorStep(step: number): number {
  const mantissa = Math.round(step / 10 ** Math.floor(Math.log10(step)));
  return step / (mantissa === 2 ? 4 : 5);
}

/** The multiples of `step` in [`from`, `to`], in increasing order. */
export function multiplesIn(from: number, to: number, step: number): number[] {
  const first = Math.ceil(from / step);
  const last = Math.floor(to / step);
  const values: number[] = [];
  // `0 +`: for i = 0 the product of a negative start is -0, which prints as "-0".
  for (let i = first; i <= last; i++) values.push(0 + i * step);
  return values;
}
