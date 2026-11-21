// Which character of the text is under the pointer.
//
// The text is drawn by a copy of it behind the box, and the box is what takes
// the pointer, so the answer is looked for in the copy: the browser says where
// the nearest caret position is, and the characters on both sides of it are
// checked against where they really are.

import { isTextCharacter } from "../../core/text/text.ts";

/** Where `offset` UTF-16 units into the text of `root` is, as a text node and a place in it. */
function locate(
  root: HTMLElement,
  offset: number,
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    if (remaining <= node.data.length) return { node, offset: remaining };
    remaining -= node.data.length;
  }
  return null;
}

function rectsOf(root: HTMLElement, start: number, end: number): DOMRect[] {
  const from = locate(root, start);
  const to = locate(root, end);
  if (!from || !to) return [];
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return [...range.getClientRects()];
}

/** The caret position nearest to a point of the copy, as units into its text. */
function boundaryAt(
  mirror: HTMLElement,
  box: HTMLElement,
  x: number,
  y: number,
): number | null {
  // The copy does not take the pointer, and cannot be selected: for the
  // moment it must, or the browser does not look at it.
  const saved = [
    mirror.style.pointerEvents,
    mirror.style.userSelect,
    box.style.pointerEvents,
  ];
  mirror.style.pointerEvents = "auto";
  mirror.style.userSelect = "text";
  box.style.pointerEvents = "none";
  let node: Node | null = null;
  let offset = 0;
  try {
    const position = document.caretPositionFromPoint?.(x, y);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    } else {
      const range = document.caretRangeFromPoint?.(x, y);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }
  } finally {
    [
      mirror.style.pointerEvents,
      mirror.style.userSelect,
      box.style.pointerEvents,
    ] = saved;
  }
  if (!node || !mirror.contains(node)) return null;
  const range = document.createRange();
  range.setStart(mirror, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/**
 * Where the character under the point (`x`, `y`, client coordinates) starts in
 * the text of `mirror`, in UTF-16 units; null when there is none to look at (white
 * space, the margin, past the end of a line). `length` is the length of the
 * text: the copy has one more character after it, which is not the user's.
 */
export function characterAtPoint(
  mirror: HTMLElement,
  box: HTMLElement,
  x: number,
  y: number,
  length: number,
): number | null {
  const boundary = boundaryAt(mirror, box, x, y);
  if (boundary === null) return null;
  const text = mirror.textContent ?? "";
  const starts: number[] = [];
  if (boundary < length) starts.push(boundary);
  if (boundary > 0) {
    const before = boundary - 1;
    const isSecondHalf =
      before > 0 &&
      text.charCodeAt(before) >= 0xdc00 &&
      text.charCodeAt(before) <= 0xdfff &&
      text.charCodeAt(before - 1) >= 0xd800 &&
      text.charCodeAt(before - 1) <= 0xdbff;
    starts.push(isSecondHalf ? before - 1 : before);
  }
  // The line is taller than the characters on it: a click between two lines
  // is still on the one it is closer to. In vertical text a line is a column,
  // and "taller" is wider.
  const computed = getComputedStyle(mirror);
  const vertical = computed.writingMode.startsWith("vertical");
  const lineHeight = Number.parseFloat(computed.lineHeight);
  for (const start of starts) {
    const codepoint = text.codePointAt(start);
    if (codepoint === undefined) continue;
    const char = String.fromCodePoint(codepoint);
    if (!isTextCharacter(char)) continue;
    for (const rect of rectsOf(mirror, start, start + char.length)) {
      const slack = Number.isFinite(lineHeight)
        ? Math.max(0, (lineHeight - (vertical ? rect.width : rect.height)) / 2)
        : 0;
      const slackX = vertical ? slack : 0;
      const slackY = vertical ? 0 : slack;
      if (
        x >= rect.left - slackX &&
        x <= rect.right + slackX &&
        y >= rect.top - slackY &&
        y <= rect.bottom + slackY
      ) {
        return start;
      }
    }
  }
  return null;
}
