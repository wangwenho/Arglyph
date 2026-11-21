/**
 * The text shown in a card's label strip: the code point as `U+XXXX` (at least
 * four hex digits, like the Unicode charts), or `gid N` for a glyph that no code
 * point maps to (.notdef, ligatures, alternates).
 */
export function formatGlyphLabel(
  unicode: number | undefined,
  glyphIndex: number,
): string {
  if (unicode === undefined) return `gid ${glyphIndex}`;
  return `U+${unicode.toString(16).toUpperCase().padStart(4, "0")}`;
}
