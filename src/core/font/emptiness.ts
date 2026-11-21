// Which glyphs of a font have no outline.
//
// Asking opentype.js for every glyph's path takes 0.6 s for Jigmo's 50,848
// glyphs, more than the 300 ms budget for loading. The font file already says
// which glyphs are empty, without building any outline:
//   TrueType (glyf)  the `loca` table gives each glyph's byte range; an empty
//                    range, or a glyph that starts with "0 contours", is empty
//   CFF (OTF)        the glyph is a small program (a charstring); a program that
//                    is only numbers and then `endchar` draws nothing
// Both read a few bytes per glyph. Anything the code does not understand gives
// `null` ("unknown") rather than a guess: the previewer then assumes the glyphs
// are drawn instead of crying wolf.

const TTF_TAGS = new Set([0x00010000, 0x74727565 /* "true" */]);
const OTF_TAG = 0x4f54544f; // "OTTO"

interface Table {
  offset: number;
  length: number;
}

function readTables(view: DataView): Map<string, Table> | null {
  if (view.byteLength < 12) return null;
  const tag = view.getUint32(0);
  if (!TTF_TAGS.has(tag) && tag !== OTF_TAG) return null;
  const count = view.getUint16(4);
  if (view.byteLength < 12 + count * 16) return null;
  const tables = new Map<string, Table>();
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const name = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    if (offset + length > view.byteLength) return null;
    tables.set(name, { offset, length });
  }
  return tables;
}

/**
 * For each glyph, 1 if the font file says it has no outline and 0 if it has
 * one; `null` when the file is not a plain TrueType or CFF-flavoured OpenType
 * font, or its tables are not as expected.
 */
export function findEmptyGlyphs(
  buffer: ArrayBuffer,
  glyphCount: number,
): Uint8Array | null {
  try {
    const view = new DataView(buffer);
    const tables = readTables(view);
    if (!tables) return null;
    const glyf = tables.get("glyf");
    const loca = tables.get("loca");
    const head = tables.get("head");
    if (glyf && loca && head) {
      return fromGlyf(view, glyf, loca, head, glyphCount);
    }
    const cff = tables.get("CFF ");
    if (cff) return fromCff(view, cff, glyphCount);
    return null;
  } catch (error) {
    // A damaged font can point outside the file (DataView throws RangeError).
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function fromGlyf(
  view: DataView,
  glyf: Table,
  loca: Table,
  head: Table,
  glyphCount: number,
): Uint8Array | null {
  if (head.length < 54) return null;
  const longOffsets = view.getInt16(head.offset + 50) === 1;
  const entrySize = longOffsets ? 4 : 2;
  if (loca.length < (glyphCount + 1) * entrySize) return null;
  const offsetAt = (i: number) =>
    longOffsets
      ? view.getUint32(loca.offset + i * 4)
      : view.getUint16(loca.offset + i * 2) * 2;

  const NOT_EMPTY = 0;
  const EMPTY = 1;
  const COMPOSITE = 2; // decided below, once every simple glyph is known

  const state = new Uint8Array(glyphCount);
  let start = offsetAt(0);
  for (let i = 0; i < glyphCount; i++) {
    const end = offsetAt(i + 1);
    if (end <= start) {
      state[i] = EMPTY;
    } else if (end - start >= 2 && end <= glyf.length) {
      // numberOfContours: 0 is a glyph with a header and nothing to draw,
      // negative is a composite of other glyphs.
      const contours = view.getInt16(glyf.offset + start);
      state[i] = contours === 0 ? EMPTY : contours > 0 ? NOT_EMPTY : COMPOSITE;
    }
    start = end;
  }

  // A composite (U+00A0 is often "the space glyph, again") is empty when all
  // of its components are. Components may come later in the font than the
  // composite, hence the second pass; the depth limit stops a cycle.
  function isEmpty(glyph: number, depth: number): boolean {
    if (glyph >= glyphCount) return false;
    if (state[glyph] !== COMPOSITE) return state[glyph] === EMPTY;
    if (depth > 8) return false;
    let p = glyf.offset + offsetAt(glyph) + 10;
    const end = glyf.offset + offsetAt(glyph + 1);
    for (;;) {
      if (p + 4 > end) return false;
      const flags = view.getUint16(p);
      const component = view.getUint16(p + 2);
      p += 4 + (flags & 0x0001 ? 4 : 2); // arguments: words or bytes
      if (flags & 0x0008)
        p += 2; // a scale
      else if (flags & 0x0040)
        p += 4; // x and y scales
      else if (flags & 0x0080) p += 8; // a 2x2 matrix
      if (!isEmpty(component, depth + 1)) return false;
      if (!(flags & 0x0020)) return true; // no more components
    }
  }
  for (let i = 0; i < glyphCount; i++) {
    if (state[i] === COMPOSITE) state[i] = isEmpty(i, 0) ? EMPTY : NOT_EMPTY;
  }
  return state;
}

// ---- CFF ------------------------------------------------------------------

/** An INDEX: a list of byte ranges. `next` is where the structure after it starts. */
interface CffIndex {
  count: number;
  /** Absolute position of the start of object `i`, for 0 <= i <= count. */
  at(i: number): number;
  next: number;
}

function readIndex(view: DataView, position: number): CffIndex | null {
  if (position + 2 > view.byteLength) return null;
  const count = view.getUint16(position);
  if (count === 0) return { count, at: () => position + 2, next: position + 2 };
  const offSize = view.getUint8(position + 2);
  if (offSize < 1 || offSize > 4) return null;
  const offsetsStart = position + 3;
  const dataBase = offsetsStart + (count + 1) * offSize - 1;
  if (dataBase > view.byteLength) return null;
  const offsetAt = (i: number) => {
    let value = 0;
    for (let b = 0; b < offSize; b++) {
      value = value * 256 + view.getUint8(offsetsStart + i * offSize + b);
    }
    return value;
  };
  const end = dataBase + offsetAt(count);
  if (end > view.byteLength) return null;
  return { count, at: (i) => dataBase + offsetAt(i), next: end };
}

/** The CharStrings offset (operator 17) of a Top DICT, or null. */
function findCharStringsOffset(
  view: DataView,
  start: number,
  end: number,
): number | null {
  let p = start;
  let operand = 0;
  while (p < end) {
    const b = view.getUint8(p);
    if (b <= 21) {
      if (b === 17) return operand;
      p += b === 12 ? 2 : 1;
    } else if (b === 28) {
      operand = view.getInt16(p + 1);
      p += 3;
    } else if (b === 29) {
      operand = view.getInt32(p + 1);
      p += 5;
    } else if (b === 30) {
      // A real number: two nibbles per byte, ending at a nibble that is 0xf.
      p++;
      while (p < end) {
        const byte = view.getUint8(p++);
        if (byte >> 4 === 0xf || (byte & 0xf) === 0xf) break;
      }
    } else if (b >= 32 && b <= 246) {
      operand = b - 139;
      p++;
    } else if (b >= 247 && b <= 250) {
      operand = (b - 247) * 256 + view.getUint8(p + 1) + 108;
      p += 2;
    } else if (b >= 251 && b <= 254) {
      operand = -(b - 251) * 256 - view.getUint8(p + 1) - 108;
      p += 2;
    } else {
      return null;
    }
  }
  return null;
}

/**
 * Whether a charstring draws nothing: only numbers, then `endchar`. The numbers
 * are the optional width (0 or 1 of them); four or five operands before
 * `endchar` is the old composite form (base and accent glyph), which draws.
 * Any other operator (a move, a line, a call to a subroutine, a hint) is taken
 * to mean there is an outline.
 */
function charstringIsEmpty(
  view: DataView,
  start: number,
  end: number,
): boolean {
  if (end <= start) return true;
  let operands = 0;
  let p = start;
  while (p < end) {
    const b = view.getUint8(p);
    if (b === 14) return operands < 4;
    if (b === 28) p += 3;
    else if (b === 255) p += 5;
    else if (b >= 247) p += 2;
    else if (b >= 32) p += 1;
    else return false;
    operands++;
  }
  return false;
}

function fromCff(
  view: DataView,
  cff: Table,
  glyphCount: number,
): Uint8Array | null {
  if (cff.length < 4) return null;
  const headerSize = view.getUint8(cff.offset + 2);
  const names = readIndex(view, cff.offset + headerSize);
  const topDicts = names && readIndex(view, names.next);
  if (!topDicts || topDicts.count < 1) return null;
  const charStringsOffset = findCharStringsOffset(
    view,
    topDicts.at(0),
    topDicts.at(1),
  );
  if (charStringsOffset === null || charStringsOffset <= 0) return null;
  const charStrings = readIndex(view, cff.offset + charStringsOffset);
  if (!charStrings || charStrings.count !== glyphCount) return null;

  const empty = new Uint8Array(glyphCount);
  for (let i = 0; i < glyphCount; i++) {
    empty[i] = charstringIsEmpty(view, charStrings.at(i), charStrings.at(i + 1))
      ? 1
      : 0;
  }
  return empty;
}
