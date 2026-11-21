import * as opentype from "opentype.js";

/**
 * Load a font from an ArrayBuffer.
 */
export function loadFont(buffer: ArrayBuffer): opentype.Font {
  return opentype.parse(buffer);
}
