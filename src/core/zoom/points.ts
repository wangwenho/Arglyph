// The points of a glyph's outline, for the zoom view.
//
// They are read from the path commands, which both kinds of font have in the
// same form: a line or curve ends on an on-curve point, and a curve brings its
// off-curve points (one for a quadratic TrueType curve, two for a cubic CFF
// one) that are joined to the on-curve points next to them by handles.
//
// opentype.js does not write a closing command: a contour ends where the next
// `M` begins, or where the commands end. A contour is closed all the same, so
// a point where it comes back to its first one is not a second point.
//
// A TrueType contour may leave an on-curve point out between two off-curve
// ones, because it is in the middle of them. opentype.js builds it back when it
// makes the commands, so it is here as a point like any other: the outline has
// the point, the file does not store it.

import type { Font, PathCommand } from "opentype.js";

/** Coordinates are in font units with y pointing down, like GlyphBox; flat `x, y, x, y, ...`. */
export interface GlyphPoints {
  onCurve: Float64Array;
  offCurve: Float64Array;
  /** Segments from an off-curve point to its neighbor on the curve: `x1, y1, x2, y2, ...`. */
  handles: Float64Array;
  contours: number;
}

export function extractPoints(commands: readonly PathCommand[]): GlyphPoints {
  const onCurve: number[] = [];
  const offCurve: number[] = [];
  const handles: number[] = [];
  let contours = 0;
  // Where the current contour began, in `onCurve`, and where it starts.
  let open = false;
  let contourStart = 0;
  let startX = 0;
  let startY = 0;
  let x = 0;
  let y = 0;

  // A contour that comes back to its first point does not have it twice.
  function endContour() {
    if (!open) return;
    open = false;
    const last = onCurve.length - 2;
    if (
      last > contourStart &&
      onCurve[last] === startX &&
      onCurve[last + 1] === startY
    ) {
      onCurve.length = last;
    }
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        endContour();
        open = true;
        contours++;
        contourStart = onCurve.length;
        startX = x = cmd.x;
        startY = y = cmd.y;
        onCurve.push(x, y);
        break;
      case "L":
        // opentype.js starts a TrueType contour with a line to the point it
        // has just moved to.
        if (cmd.x !== x || cmd.y !== y) onCurve.push(cmd.x, cmd.y);
        x = cmd.x;
        y = cmd.y;
        break;
      case "Q":
        offCurve.push(cmd.x1, cmd.y1);
        handles.push(x, y, cmd.x1, cmd.y1, cmd.x1, cmd.y1, cmd.x, cmd.y);
        onCurve.push(cmd.x, cmd.y);
        x = cmd.x;
        y = cmd.y;
        break;
      case "C":
        offCurve.push(cmd.x1, cmd.y1, cmd.x2, cmd.y2);
        handles.push(x, y, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        onCurve.push(cmd.x, cmd.y);
        x = cmd.x;
        y = cmd.y;
        break;
      case "Z":
        endContour();
        break;
    }
  }
  endContour();
  return {
    onCurve: Float64Array.from(onCurve),
    offCurve: Float64Array.from(offCurve),
    handles: Float64Array.from(handles),
    contours,
  };
}

/** The points of glyph `glyphIndex`, in the same coordinates as buildGlyphRenderData. */
export function buildGlyphPoints(font: Font, glyphIndex: number): GlyphPoints {
  const outline = font.glyphs.get(glyphIndex).getPath(0, 0, font.unitsPerEm);
  return extractPoints(outline.commands);
}
