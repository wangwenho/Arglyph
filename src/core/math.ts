/** `value` kept between `min` and `max`. When `max < min`, `min` wins. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
