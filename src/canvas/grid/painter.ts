// Draws one frame of the grid onto the canvas.
//
// The frame is drawn in passes, bottom to top: backgrounds, baselines, state
// marks, glyphs, frame lines, labels, highlights. Each pass accumulates its shapes into one
// path and draws it with a single fill or stroke, which is much cheaper than
// one call per card. Frame lines come after the glyphs so a clipped glyph never
// covers them.

import type { GlyphMetrics } from "../../core/font/metrics.ts";
import type { GlyphCache, GlyphRenderData } from "../../core/glyph/cache.ts";
import { isGlyphClipped } from "../../core/glyph/clipped.ts";
import {
  computeGlyphBaselineY,
  computeGlyphOriginX,
} from "../../core/glyph/origin.ts";
import {
  GLYPH_BLANK,
  GLYPH_MISSING,
  GLYPH_UNDRAWN,
} from "../../core/glyph/state.ts";
import {
  type CardLayout,
  clippedMarkSize,
  computeCardX,
  computeCardY,
  computeCol,
  computeRow,
  computeSquareY,
  labelFontSize,
  snapToPixelCenter,
} from "../../core/grid/layout.ts";
import type { GridModel } from "../../core/grid/model.ts";
import type { Palette } from "../theme.ts";

// Corner radius of the hover tint and the selection ring, in pixels.
const HIGHLIGHT_RADIUS = 3;
// Used when the page gives no editor font (the dev page).
const FALLBACK_LABEL_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
// Distance between the diagonal lines on a undrawn card, and how
// strongly they and the label of a missing card show (0 to 1).
const HATCH_SPACING = 6;
const HATCH_ALPHA = 0.45;
const MISSING_LABEL_ALPHA = 0.45;
// How strongly the dashed frame of a blank card shows (0 to 1).
const BLANK_FRAME_ALPHA = 0.7;

/**
 * What to draw. The view owns one of these and updates it in place before every
 * frame, so drawing allocates nothing.
 */
export interface GridFrame {
  width: number;
  height: number;
  scrollTop: number;
  /** Card size and number of columns for this frame. */
  layout: CardLayout;
  /** The colors for the current theme. */
  palette: Palette;
  /** First item to draw, and one past the last. */
  firstIndex: number;
  endIndex: number;
  model: GridModel | null;
  cache: GlyphCache<GlyphRenderData> | null;
  metrics: GlyphMetrics;
  /** Item under the pointer, or -1. */
  hoverIndex: number;
  /** Selected item, or -1. */
  selectedIndex: number;
}

export function createGridPainter(
  ctx: CanvasRenderingContext2D,
): (frame: GridFrame) => void {
  // And their states, so each item is classified once per frame, not once per
  // pass. Grown when a frame shows more items than before.
  let states = new Uint8Array(0);
  function readStates(frame: GridFrame) {
    const { model, firstIndex, endIndex } = frame;
    if (!model) return;
    if (states.length < endIndex - firstIndex) {
      states = new Uint8Array((endIndex - firstIndex) * 2);
    }
    for (let index = firstIndex; index < endIndex; index++) {
      states[index - firstIndex] = model.stateAt(index);
    }
  }

  // The label font is the editor's own, like the code points in the inspector
  // (the --mono variable), read again when the theme changes (a new palette).
  // It only changes with the card size, so build the string once per size, not
  // once per frame.
  let fontSize = 0;
  let fontString = "";
  let familyOf: Palette | null = null;
  let family = FALLBACK_LABEL_FONT_FAMILY;
  function labelFont(size: number, palette: Palette): string {
    if (palette !== familyOf) {
      familyOf = palette;
      const editor = getComputedStyle(document.body)
        .getPropertyValue("--mono")
        .trim();
      family = editor === "" ? FALLBACK_LABEL_FONT_FAMILY : editor;
      fontSize = 0;
    }
    const px = labelFontSize(size);
    if (px !== fontSize) {
      fontSize = px;
      fontString = `${px}px ${family}`;
    }
    return fontString;
  }

  function drawBackgrounds(frame: GridFrame) {
    const { layout, scrollTop, firstIndex, endIndex } = frame;
    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      ctx.rect(cardX, cardY, layout.size, layout.cardHeight);
    }
    ctx.fillStyle = frame.palette.cardFill;
    ctx.fill();

    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      ctx.rect(cardX, cardY, layout.size, layout.labelHeight);
    }
    ctx.fillStyle = frame.palette.labelFill;
    ctx.fill();
  }

  // Skipped when the font's ascender puts the baseline outside the square,
  // where it would be drawn over a neighbouring card.
  function drawBaselines(frame: GridFrame) {
    const { layout, scrollTop, firstIndex, endIndex, metrics } = frame;
    if (!(metrics.ascent > 0 && metrics.ascent < layout.size)) return;
    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      if (states[index - firstIndex] === GLYPH_MISSING) continue;
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      const y = snapToPixelCenter(
        computeGlyphBaselineY(computeSquareY(cardY, layout), metrics.ascent),
      );
      ctx.moveTo(cardX, y);
      ctx.lineTo(cardX + layout.size, y);
    }
    ctx.strokeStyle = frame.palette.baselineStroke;
    ctx.stroke();
  }

  // A blank glyph (empty as it should be: a space, a control) is an empty frame,
  // dashed and inset from the cell's edge, so it reads differently from a plain
  // cell and from a missing one (filled). The same shape as its swatch.
  function drawBlankFrames(frame: GridFrame) {
    const { layout, scrollTop, firstIndex, endIndex } = frame;
    const inset = Math.max(3, Math.round(layout.size / 10)) + 0.5;
    const side = layout.size - 2 * inset;
    if (side <= 4) return;
    let any = false;
    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      if (states[index - firstIndex] !== GLYPH_BLANK) continue;
      any = true;
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      ctx.rect(
        cardX + inset,
        computeSquareY(cardY, layout) + inset,
        side,
        side,
      );
    }
    if (!any) return;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = frame.palette.blankStroke;
    ctx.globalAlpha = BLANK_FRAME_ALPHA;
    ctx.stroke();
    ctx.restore();
  }

  // The cells of the font's gaps: a missing code point is a plain, slightly
  // tinted square (the same tint as the label strip); a glyph that is empty
  // though Unicode says it should have ink gets diagonal lines in the warning
  // color. Both are accumulated into one path per kind.
  function drawStateMarks(frame: GridFrame) {
    const { layout, scrollTop, firstIndex, endIndex } = frame;
    const size = layout.size;
    let anyMissing = false;
    let anySuspect = false;
    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      if (states[index - firstIndex] !== GLYPH_MISSING) continue;
      anyMissing = true;
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      ctx.rect(cardX, computeSquareY(cardY, layout), size, size);
    }
    if (anyMissing) {
      ctx.fillStyle = frame.palette.missingFill;
      ctx.fill();
    }

    drawBlankFrames(frame);

    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      if (states[index - firstIndex] !== GLYPH_UNDRAWN) continue;
      anySuspect = true;
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      const squareY = computeSquareY(cardY, layout);
      // Lines from the top/right edges to the left/bottom edges, ending
      // exactly on the square's border, so no clipping is needed.
      for (let d = HATCH_SPACING; d < 2 * size; d += HATCH_SPACING) {
        ctx.moveTo(cardX + Math.min(d, size), squareY + Math.max(0, d - size));
        ctx.lineTo(cardX + Math.max(0, d - size), squareY + Math.min(d, size));
      }
    }
    if (anySuspect) {
      ctx.globalAlpha = HATCH_ALPHA;
      ctx.strokeStyle = frame.palette.clippedMark;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Each glyph is clipped to its own square. Glyphs that stick out of it are
  // remembered as a triangle for the label pass (one Path2D per frame, not per
  // card).
  function drawGlyphs(frame: GridFrame): Path2D {
    const clippedMarks = new Path2D();
    const markSize = clippedMarkSize(frame.layout.size);
    const { model, cache, metrics, layout, scrollTop, firstIndex, endIndex } =
      frame;
    if (!model || !cache) return clippedMarks;

    ctx.fillStyle = frame.palette.glyphFill;
    for (let index = firstIndex; index < endIndex; index++) {
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      const squareY = computeSquareY(cardY, layout);
      const glyphIndex = model.glyphIndexAt(index);
      if (glyphIndex < 0) continue; // a missing code point: nothing to draw
      const data = cache.get(glyphIndex);

      const originX = computeGlyphOriginX(
        cardX,
        layout.size,
        metrics.scale,
        data,
      );
      const baselineY = computeGlyphBaselineY(squareY, metrics.ascent);

      ctx.save();
      ctx.beginPath();
      ctx.rect(cardX, squareY, layout.size, layout.size);
      ctx.clip();
      ctx.translate(originX, baselineY);
      ctx.scale(metrics.scale, metrics.scale);
      ctx.fill(data.path);
      ctx.restore();

      if (
        isGlyphClipped(
          data,
          metrics.scale,
          originX,
          baselineY,
          cardX,
          squareY,
          layout.size,
        )
      ) {
        const right = cardX + layout.size;
        const top = cardY + 1;
        clippedMarks.moveTo(right - markSize, top);
        clippedMarks.lineTo(right, top);
        clippedMarks.lineTo(right, top + markSize);
        clippedMarks.closePath();
      }
    }
    return clippedMarks;
  }

  // A card owns its left and top line; its right and bottom line are drawn one
  // pixel into the neighbour, where the neighbour draws the same line, so two
  // cards share a single 1px line.
  function drawFrameLines(frame: GridFrame) {
    const { layout, scrollTop, firstIndex, endIndex } = frame;
    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      ctx.rect(
        snapToPixelCenter(cardX),
        snapToPixelCenter(cardY),
        layout.size,
        layout.cardHeight,
      );
    }
    ctx.strokeStyle = frame.palette.frameStroke;
    ctx.stroke();

    ctx.beginPath();
    for (let index = firstIndex; index < endIndex; index++) {
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      const y = snapToPixelCenter(computeSquareY(cardY, layout));
      ctx.moveTo(cardX + 1, y);
      ctx.lineTo(cardX + layout.size, y);
    }
    ctx.strokeStyle = frame.palette.dividerStroke;
    ctx.stroke();
  }

  function drawLabels(frame: GridFrame, clippedMarks: Path2D) {
    const { model, layout, scrollTop, firstIndex, endIndex } = frame;
    if (!model) return;
    ctx.font = labelFont(layout.size, frame.palette);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = frame.palette.labelText;
    for (let index = firstIndex; index < endIndex; index++) {
      const cardX = computeCardX(computeCol(index, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(index, layout.cols),
        scrollTop,
        layout,
      );
      const missing = states[index - firstIndex] === GLYPH_MISSING;
      if (missing) ctx.globalAlpha = MISSING_LABEL_ALPHA;
      ctx.fillText(
        model.labelAt(index),
        cardX + layout.size / 2,
        cardY + layout.labelHeight / 2 + 1,
      );
      if (missing) ctx.globalAlpha = 1;
    }
    ctx.fillStyle = frame.palette.clippedMark;
    ctx.fill(clippedMarks);
  }

  // Hover tints the card (inside its frame lines); the selection is a 2px ring
  // around it. Both have rounded corners. Like the frame lines, the right and
  // bottom edge sit on the neighbour's first pixel.
  function drawHighlights(frame: GridFrame) {
    const { layout, scrollTop, hoverIndex, selectedIndex } = frame;
    if (hoverIndex >= 0) {
      const cardX = computeCardX(computeCol(hoverIndex, layout.cols), layout);
      const cardY = computeCardY(
        computeRow(hoverIndex, layout.cols),
        scrollTop,
        layout,
      );
      ctx.fillStyle = frame.palette.hoverFill;
      ctx.beginPath();
      ctx.roundRect(
        cardX + 1,
        cardY + 1,
        layout.size - 1,
        layout.cardHeight - 1,
        HIGHLIGHT_RADIUS,
      );
      ctx.fill();
    }
    if (selectedIndex >= 0) {
      const cardX = computeCardX(
        computeCol(selectedIndex, layout.cols),
        layout,
      );
      const cardY = computeCardY(
        computeRow(selectedIndex, layout.cols),
        scrollTop,
        layout,
      );
      ctx.lineWidth = 2;
      ctx.strokeStyle = frame.palette.selectionStroke;
      ctx.beginPath();
      ctx.roundRect(
        cardX + 1,
        Math.round(cardY) + 1,
        layout.size - 1,
        layout.cardHeight - 1,
        HIGHLIGHT_RADIUS,
      );
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  return function paint(frame) {
    ctx.clearRect(0, 0, frame.width, frame.height);
    ctx.lineWidth = 1;
    readStates(frame);
    drawBackgrounds(frame);
    drawBaselines(frame);
    drawStateMarks(frame);
    const clippedMarks = drawGlyphs(frame);
    drawFrameLines(frame);
    drawLabels(frame, clippedMarks);
    drawHighlights(frame);
  };
}
