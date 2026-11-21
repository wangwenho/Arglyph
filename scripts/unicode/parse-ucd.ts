// Parsers for the UCD files (https://www.unicode.org/reports/tr44/). They throw
// on anything unexpected: the generator should fail while building, not hand
// the extension a table that is quietly wrong.

const MAX_CODEPOINT = 0x10ffff;
const BLOCK_LINE = /^([0-9A-F]{4,6})\.\.([0-9A-F]{4,6}); (.+)$/;

/** One block of `Blocks.txt`: first and last code point (inclusive), name. */
export interface Block {
  start: number;
  end: number;
  name: string;
}

/** A run of consecutive assigned code points of one kind (a KIND_* value). */
export interface Run {
  start: number;
  end: number;
  kind: number;
}

/** First and last code point, inclusive. */
export type CodepointRange = readonly [start: number, end: number];

/**
 * Parse `Blocks.txt`: lines of `0000..007F; Basic Latin`, `#` comments, blank
 * lines. Returns the blocks in file order, which must be ascending and must not
 * overlap. Every block starts on a multiple of 16 and ends one before the next
 * multiple (a UCD rule for blocks); a violation means the format changed.
 * When `version` is given, the header must name it.
 */
export function parseBlocks(text: string, version?: string): Block[] {
  const lines = text.split(/\r?\n/);
  if (version !== undefined && lines[0] !== `# Blocks-${version}.txt`) {
    throw new Error(
      `Blocks.txt: expected the header "# Blocks-${version}.txt", got ${JSON.stringify(lines[0])}`,
    );
  }
  const blocks: Block[] = [];
  for (const [i, line] of lines.entries()) {
    if (line === "" || line.startsWith("#")) continue;
    const where = `Blocks.txt line ${i + 1}`;
    const match = BLOCK_LINE.exec(line);
    if (!match)
      throw new Error(`${where}: cannot parse ${JSON.stringify(line)}`);
    const start = Number.parseInt(match[1], 16);
    const end = Number.parseInt(match[2], 16);
    const name = match[3];
    if (end > MAX_CODEPOINT || start > end) {
      throw new Error(`${where}: bad range ${match[1]}..${match[2]}`);
    }
    if (start % 16 !== 0 || end % 16 !== 15) {
      throw new Error(`${where}: ${name} is not aligned to 16 code points`);
    }
    const previous = blocks.at(-1);
    if (previous && start <= previous.end) {
      throw new Error(
        `${where}: ${name} overlaps or precedes ${previous.name}`,
      );
    }
    blocks.push({ start, end, name });
  }
  if (blocks.length === 0) throw new Error("Blocks.txt: no blocks found");
  return blocks;
}

// What a font is expected to do with an assigned code point, from its general
// category. These numbers end up in the generated module.
//   INK       letters, numbers, punctuation, symbols, spacing marks: a font
//             should have them, and a glyph with an empty outline is a defect
//   BLANK     spaces, format characters, non-spacing and enclosing marks
//             (variation selectors, joiners): a font should have them, and an
//             empty outline is what they should be
//   OPTIONAL  controls, private use and surrogates: a font need not have them,
//             and Unicode says nothing about their shape. Never "missing", and
//             an empty glyph is not judged
export const KIND_INK = 0;
export const KIND_BLANK = 1;
export const KIND_OPTIONAL = 2;

const BLANK_CATEGORIES = new Set(["Zs", "Zl", "Zp", "Cf", "Mn", "Me"]);
const OPTIONAL_CATEGORIES = new Set(["Cc", "Cs", "Co"]);
const INK_CATEGORIES = new Set([
  ...["Lu", "Ll", "Lt", "Lm", "Lo", "Mc", "Nd", "Nl", "No"],
  ...["Pc", "Pd", "Ps", "Pe", "Pi", "Pf", "Po", "Sm", "Sc", "Sk", "So"],
]);

/** The kind of a general category; throws for one this table does not know. */
export function kindOfCategory(category: string): number {
  if (INK_CATEGORIES.has(category)) return KIND_INK;
  if (BLANK_CATEGORIES.has(category)) return KIND_BLANK;
  if (OPTIONAL_CATEGORIES.has(category)) return KIND_OPTIONAL;
  throw new Error(`UnicodeData.txt: unknown general category "${category}"`);
}

/**
 * Parse `UnicodeData.txt` (`0041;LATIN CAPITAL LETTER A;Lu;0;L;;;;;N;;;;0061;`)
 * into runs of consecutive assigned code points of the same kind, ascending.
 * Large ranges (CJK ideographs, Hangul, private use) are two lines,
 * `<..., First>` and `<..., Last>`, that stand for everything between. Code
 * points that do not appear are unassigned (category Cn).
 */
export function parseUnicodeData(text: string): Run[] {
  const runs: Run[] = [];
  let rangeStart: number | null = null;
  let rangeName = "";
  let lastEnd = -1;
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (line === "") continue;
    const where = `UnicodeData.txt line ${i + 1}`;
    const fields = line.split(";");
    if (fields.length < 3 || !/^[0-9A-F]{4,6}$/.test(fields[0])) {
      throw new Error(`${where}: cannot parse ${JSON.stringify(line)}`);
    }
    const codepoint = Number.parseInt(fields[0], 16);
    const name = fields[1];
    const kind = kindOfCategory(fields[2]);
    let start = codepoint;
    if (name.endsWith(", First>")) {
      if (rangeStart !== null) throw new Error(`${where}: unclosed range`);
      rangeStart = codepoint;
      rangeName = name.slice(0, -", First>".length);
      continue;
    }
    if (name.endsWith(", Last>")) {
      if (
        rangeStart === null ||
        name.slice(0, -", Last>".length) !== rangeName
      ) {
        throw new Error(`${where}: "Last" without a matching "First"`);
      }
      start = rangeStart;
      rangeStart = null;
    } else if (rangeStart !== null) {
      throw new Error(`${where}: range ${rangeName} is not closed`);
    }
    if (codepoint > 0x10ffff || start > codepoint || start <= lastEnd) {
      throw new Error(`${where}: out of order or out of range`);
    }
    lastEnd = codepoint;
    const previous = runs.at(-1);
    if (previous && previous.kind === kind && previous.end + 1 === start) {
      previous.end = codepoint;
    } else {
      runs.push({ start, end: codepoint, kind });
    }
  }
  if (rangeStart !== null) throw new Error("UnicodeData.txt: unclosed range");
  if (runs.length === 0) throw new Error("UnicodeData.txt: no characters");
  return runs;
}

/**
 * Parse the Default_Ignorable_Code_Point lines of `DerivedCoreProperties.txt`
 * (`115F..1160    ; Default_Ignorable_Code_Point # Lo [2] HANGUL CHOSEONG...`).
 * These are characters that are invisible by design: soft hyphen, joiners,
 * variation selectors, and a few that the general category alone would call
 * letters (the Hangul fillers). Includes reserved code points; the caller only
 * uses them on assigned ones. When `version` is given, the header must name it.
 */
export function parseDefaultIgnorable(
  text: string,
  version?: string,
): CodepointRange[] {
  const lines = text.split(/\r?\n/);
  if (
    version !== undefined &&
    lines[0] !== `# DerivedCoreProperties-${version}.txt`
  ) {
    throw new Error(
      `DerivedCoreProperties.txt: expected the header "# DerivedCoreProperties-${version}.txt", got ${JSON.stringify(lines[0])}`,
    );
  }
  const ranges: CodepointRange[] = [];
  for (const [i, line] of lines.entries()) {
    const match =
      /^([0-9A-F]{4,6})(?:\.\.([0-9A-F]{4,6}))?\s*;\s*Default_Ignorable_Code_Point\s*#/.exec(
        line,
      );
    if (!match) continue;
    const start = Number.parseInt(match[1], 16);
    const end = match[2] === undefined ? start : Number.parseInt(match[2], 16);
    if (start > end || end > MAX_CODEPOINT) {
      throw new Error(`DerivedCoreProperties.txt line ${i + 1}: bad range`);
    }
    ranges.push([start, end]);
  }
  if (ranges.length === 0) {
    throw new Error(
      "DerivedCoreProperties.txt: no Default_Ignorable_Code_Point",
    );
  }
  return ranges;
}

/**
 * Code points that are blank by design although their category says "symbol":
 * U+2800 BRAILLE PATTERN BLANK (a braille cell with no dots) is a symbol (So)
 * and not Default_Ignorable, but a font that draws ink for it is wrong.
 */
export const EXTRA_BLANK_RANGES: readonly CodepointRange[] = [[0x2800, 0x2800]];

/**
 * Give every assigned code point in `ranges` the kind `kind`, splitting runs
 * where a range cuts through them and merging neighbours of the same kind
 * again. Code points that are in no run (unassigned) stay unassigned. `runs`
 * must be ascending.
 */
export function overrideKind(
  runs: readonly Run[],
  ranges: readonly CodepointRange[],
  kind: number,
): Run[] {
  const result: Run[] = [];
  const push = (start: number, end: number, k: number) => {
    const previous = result.at(-1);
    if (previous && previous.kind === k && previous.end + 1 === start) {
      previous.end = end;
    } else {
      result.push({ start, end, kind: k });
    }
  };
  for (const run of runs) {
    // The parts of this run covered by a range, ascending and non-overlapping.
    const cuts = ranges
      .map(([s, e]) => [Math.max(s, run.start), Math.min(e, run.end)] as const)
      .filter(([s, e]) => s <= e)
      .sort((a, b) => a[0] - b[0]);
    let next = run.start;
    for (const [s, e] of cuts) {
      if (e < next) continue; // inside a part already handled
      const from = Math.max(s, next);
      if (from > next) push(next, from - 1, run.kind);
      push(from, e, kind);
      next = e + 1;
    }
    if (next <= run.end) push(next, run.end, run.kind);
  }
  return result;
}
