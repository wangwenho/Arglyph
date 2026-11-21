// Numbers and counts as the interface writes them: always the same way, whatever
// the locale of the machine (a count of glyphs reads 20,950 for everyone).

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** `1 result`, `2 results`, `1,024 glyphs`. */
export function plural(n: number, noun: string): string {
  return `${formatCount(n)} ${noun}${n === 1 ? "" : "s"}`;
}
