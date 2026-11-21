// Draws one glyph large, with its layout lines.
//
// Unlike the grid, nothing is clipped: the em square is only an outline, and a
// glyph that sticks out of it is drawn in full. The inspector shows it small and
// the zoom view big; both use this painter, they differ in the transform.

import { type FontVerticals, usedMetrics } from "../core/font/metrics.ts";
import type { GlyphRenderData } from "../core/glyph/cache.ts";
import { computeSquareX, type GlyphBox } from "../core/glyph/origin.ts";
import { snapToPixelCenter } from "../core/grid/layout.ts";
import type { ZoomLayers } from "../core/zoom/layers.ts";
import type { GlyphPoints } from "../core/zoom/points.ts";
import { multiplesIn, rulerMinorStep, rulerStep } from "../core/zoom/ruler.ts";
import type { ViewTransform } from "../core/zoom/view-transform.ts";
import type { Palette } from "./theme.ts";

/** Stands in for a glyph the font does not have: only the layout lines are drawn. */
export function missingGlyphBox(unitsPerEm: number): GlyphBox {
  return {
    advance: unitsPerEm,
    inkMinX: 0,
    inkMaxX: 0,
    inkMinY: 0,
    inkMaxY: 0,
  };
}

export interface GlyphFrame {
  /** Size of the canvas, in CSS pixels (the context is already scaled for the pixel ratio). */
  width: number;
  height: number;
  transform: ViewTransform;
  /** null: the font has no glyph here. */
  data: GlyphRenderData | null;
  /** The outline's points; only read when the points layer is on. */
  points: GlyphPoints | null;
  unitsPerEm: number;
  /** Height of the em square above the baseline, in font units. */
  ascender: number;
  /** The font's vertical metrics; only read when the metrics layer is on. */
  verticals: FontVerticals | null;
  layers: ZoomLayers;
  palette: Palette;
  /** Name the guides on the canvas. The zoom view does; the small preview is too small to. */
  labels?: boolean;
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** The horizontal lines of the Metrics layer: height above the baseline in font units, and its name. */
function metricLines(
  verticals: FontVerticals,
): readonly { name: string; height: number }[] {
  const { ascender, descender } = usedMetrics(verticals);
  const lines = [
    { name: "ascender", height: ascender },
    { name: "descender", height: descender },
  ];
  // Only a font that says them: a CJK font often has no x-height to draw.
  if (verticals.capHeight !== null) {
    lines.push({ name: "cap height", height: verticals.capHeight });
  }
  if (verticals.xHeight !== null) {
    lines.push({ name: "x-height", height: verticals.xHeight });
  }
  return lines;
}

// Each kind of guide has its own dash (palette.dashes, from the theme): by
// default dotted metrics, a solid em square and dashed advance edges, so they
// read as different kinds of line.
function paintMetrics(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  verticals: FontVerticals,
) {
  const { width, palette } = frame;
  const { scale, y: baselineY } = frame.transform;
  ctx.strokeStyle = palette.metricsStroke;
  ctx.setLineDash(palette.dashes.metrics);
  for (const { height } of metricLines(verticals)) {
    const y = snapToPixelCenter(baselineY - height * scale);
    line(ctx, 0, y, width, y);
  }
  ctx.setLineDash([]);
}

/** A number of font units as the inspector writes it: whole, or one decimal. */
function formatFontUnits(units: number): string {
  const text = Number.isInteger(units) ? String(units) : units.toFixed(1);
  return text.replace("-", "−");
}

/** Thickness of the ruler along the top, and width of the one along the left (px). */
const RULER_TOP = 22;
const RULER_LEFT = 42;

/** What the rulers take from the labels: they sit inside the strips. */
function insetOf(frame: GlyphFrame): { top: number; left: number } {
  return frame.labels && frame.layers.rulers
    ? { top: RULER_TOP, left: RULER_LEFT }
    : { top: 0, left: 0 };
}

// Lines at the numbered marks of the rulers, under everything: they only help
// the eye to read a position, so they are the faintest line there is.
function paintGrid(ctx: CanvasRenderingContext2D, frame: GlyphFrame) {
  const { width, height, palette } = frame;
  const { scale, x: originX, y: baselineY } = frame.transform;
  const step = rulerStep(scale);
  ctx.strokeStyle = palette.dividerStroke;
  for (const units of multiplesIn(
    -originX / scale,
    (width - originX) / scale,
    step,
  )) {
    const x = snapToPixelCenter(originX + units * scale);
    line(ctx, x, 0, x, height);
  }
  for (const units of multiplesIn(
    (baselineY - height) / scale,
    baselineY / scale,
    step,
  )) {
    const y = snapToPixelCenter(baselineY - units * scale);
    line(ctx, 0, y, width, y);
  }
}

/** A number as a ruler writes it: whole when it can be, no more decimals than the step needs. */
function formatRuler(units: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.ceil(-Math.log10(step));
  return units.toFixed(decimals).replace("-", "−");
}

// Numbers along the top and left edges: x counts from the glyph origin and y up
// from the baseline, as the guide labels and the inspector count, not from the
// corner of the em square. The strips are opaque, so the glyph slides under them.
function paintRulers(ctx: CanvasRenderingContext2D, frame: GlyphFrame) {
  const { width, height, palette } = frame;
  const { scale, x: originX, y: baselineY } = frame.transform;
  const step = rulerStep(scale);
  const minor = rulerMinorStep(step);

  ctx.save();
  ctx.fillStyle = palette.labelFill;
  ctx.fillRect(0, 0, width, RULER_TOP);
  ctx.fillRect(0, 0, RULER_LEFT, height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.frameStroke;
  line(ctx, 0, RULER_TOP + 0.5, width, RULER_TOP + 0.5);
  line(ctx, RULER_LEFT + 0.5, 0, RULER_LEFT + 0.5, height);

  ctx.font = guideLabelFont(palette);
  ctx.fillStyle = palette.labelText;
  ctx.textBaseline = "alphabetic";
  const tick = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    long: boolean,
  ) => {
    ctx.strokeStyle = long ? palette.labelText : palette.metricsStroke;
    line(ctx, x1, y1, x2, y2);
  };

  // Top: minor marks, then numbered ones, which are the multiples of `step`.
  const left = -originX / scale;
  const right = (width - originX) / scale;
  for (const units of multiplesIn(left, right, minor)) {
    const x = snapToPixelCenter(originX + units * scale);
    if (x <= RULER_LEFT) continue;
    const major = Math.abs(units / step - Math.round(units / step)) < 1e-9;
    tick(x, RULER_TOP, x, RULER_TOP - (major ? 9 : 4), major);
    if (major) {
      ctx.textAlign = "left";
      ctx.fillText(formatRuler(units, step), x + 3, RULER_TOP - 8);
    }
  }
  // Left: heights above the baseline.
  const bottom = (baselineY - height) / scale;
  const top = baselineY / scale;
  for (const units of multiplesIn(bottom, top, minor)) {
    const y = snapToPixelCenter(baselineY - units * scale);
    if (y <= RULER_TOP) continue;
    const major = Math.abs(units / step - Math.round(units / step)) < 1e-9;
    tick(RULER_LEFT, y, RULER_LEFT - (major ? 9 : 4), y, major);
    if (major) {
      ctx.textAlign = "right";
      ctx.fillText(formatRuler(units, step), RULER_LEFT - 12, y + 4);
    }
  }
  ctx.restore();
}

/** The glyph has ink, so it has bearings to show. */
function hasInk(box: GlyphBox): boolean {
  return box.inkMaxX > box.inkMinX;
}

// The space either side of the ink as two tinted bands, full height like the
// advance edges: the band is the measure, so no bracket is needed to read it.
// The ink's own edges are the bands' inner edges, which the bounding box layer
// draws in the same green.
function paintBearings(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  box: GlyphBox,
) {
  const { scale, x: originX } = frame.transform;
  const left = originX + box.inkMinX * scale;
  const right = originX + box.inkMaxX * scale;
  const advanceX = originX + box.advance * scale;
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = frame.palette.advanceStroke;
  ctx.fillRect(originX, 0, left - originX, frame.height);
  ctx.fillRect(right, 0, advanceX - right, frame.height);
  ctx.restore();
}

/** Where the row of brackets that carries the bearings' values is, from the top of the view. */
const BRACKET_ROW_Y = 44;

// One span of the bracket row: a line with a tick at each end, and its name and
// value centered over the part of it that is in view, so it can still be read
// when the glyph is zoomed so far that its ends are off screen. A span too
// narrow for its words puts them beside it instead (`outside`).
function paintSpan(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  from: number,
  to: number,
  text: string,
  outside: "left" | "right" | null,
) {
  const { width, palette } = frame;
  if (to <= 0 || from >= width) return;
  const rowY = BRACKET_ROW_Y + insetOf(frame).top;
  const y = snapToPixelCenter(rowY);
  // A label before this one left the halo's thick line on the context.
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.advanceStroke;
  line(ctx, Math.max(from, 0), y, Math.min(to, width), y);
  for (const x of [from, to]) {
    if (x >= 0 && x <= width) {
      line(ctx, snapToPixelCenter(x), y - 4, snapToPixelCenter(x), y + 5);
    }
  }
  const room = ctx.measureText(text).width + LABEL_GAP * 2;
  const textY = rowY - LABEL_GAP;
  if (outside && to - from < room) {
    if (outside === "left") {
      guideLabel(
        ctx,
        frame,
        text,
        palette.advanceStroke,
        from - LABEL_GAP,
        textY,
        "right",
      );
    } else {
      guideLabel(
        ctx,
        frame,
        text,
        palette.advanceStroke,
        to + LABEL_GAP,
        textY,
        "left",
      );
    }
    return;
  }
  const center = (Math.max(from, 0) + Math.min(to, width)) / 2;
  guideLabel(ctx, frame, text, palette.advanceStroke, center, textY, "center");
}

function paintBearingLabels(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  box: GlyphBox,
) {
  const { scale, x: originX } = frame.transform;
  const origin = originX;
  const left = originX + box.inkMinX * scale;
  const right = originX + box.inkMaxX * scale;
  const advanceX = originX + box.advance * scale;
  paintSpan(
    ctx,
    frame,
    origin,
    left,
    `LSB: ${formatFontUnits(box.inkMinX)}`,
    "left",
  );
  paintSpan(
    ctx,
    frame,
    left,
    right,
    `glyph width: ${formatFontUnits(box.inkMaxX - box.inkMinX)}`,
    null,
  );
  paintSpan(
    ctx,
    frame,
    right,
    advanceX,
    `RSB: ${formatFontUnits(box.advance - box.inkMaxX)}`,
    "right",
  );
}

function paintLayout(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  box: GlyphBox,
) {
  const { width, height, transform, unitsPerEm, ascender, palette } = frame;
  const { scale, x: originX, y: baselineY } = transform;
  const squareSize = unitsPerEm * scale;
  const squareX = computeSquareX(originX, squareSize, scale, box);
  const squareY = baselineY - ascender * scale;

  // Em square.
  ctx.strokeStyle = palette.squareStroke;
  ctx.setLineDash(palette.dashes.square);
  ctx.strokeRect(
    snapToPixelCenter(squareX),
    snapToPixelCenter(squareY),
    squareSize,
    squareSize,
  );
  ctx.setLineDash([]);

  // Edges of the advance box: dashed, the whole height of the view.
  if (frame.data) {
    ctx.strokeStyle = palette.advanceStroke;
    ctx.setLineDash(palette.dashes.advance);
    for (const x of [originX, originX + box.advance * scale]) {
      line(ctx, snapToPixelCenter(x), 0, snapToPixelCenter(x), height);
    }
    ctx.setLineDash([]);
  }

  // Baseline.
  ctx.strokeStyle = palette.baselineStroke;
  ctx.setLineDash(palette.dashes.baseline);
  line(
    ctx,
    0,
    snapToPixelCenter(baselineY),
    width,
    snapToPixelCenter(baselineY),
  );
  ctx.setLineDash([]);
}

const LABEL_FONT_SIZE = 11;
/** Room kept between a label and the edge of the view or the line it names (px). */
const LABEL_GAP = 5;

let labelFont = "";
let labelFontOf: Palette | null = null;

// The label font is the editor's, as the grid's labels are.
function guideLabelFont(palette: Palette): string {
  if (palette !== labelFontOf) {
    labelFontOf = palette;
    const family = getComputedStyle(document.body)
      .getPropertyValue("--mono")
      .trim();
    labelFont = `${LABEL_FONT_SIZE}px ${family === "" ? "monospace" : family}`;
  }
  return labelFont;
}

// Words on the lines, in each line's own color. A halo in the canvas color keeps
// them readable over the glyph, which is drawn under them.
function guideLabel(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  text: string,
  color: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
) {
  ctx.textAlign = align;
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = frame.palette.cardFill;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function paintGuideLabels(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  box: GlyphBox,
) {
  const { width, height, transform, unitsPerEm, ascender, palette } = frame;
  const { scale, x: originX, y: baselineY } = transform;
  const squareSize = unitsPerEm * scale;
  const squareX = computeSquareX(originX, squareSize, scale, box);
  const squareY = baselineY - ascender * scale;
  const layout = frame.layers.layout;
  const inset = insetOf(frame);

  ctx.save();
  ctx.font = guideLabelFont(palette);
  ctx.textBaseline = "alphabetic";

  // Baseline: at the left edge, above the line.
  if (layout && baselineY > LABEL_FONT_SIZE + inset.top && baselineY < height) {
    guideLabel(
      ctx,
      frame,
      "baseline",
      palette.baselineStroke,
      inset.left + LABEL_GAP,
      baselineY - LABEL_GAP,
      "left",
    );
  }

  // Em square: inside its top-left corner, when that corner is in view.
  if (
    layout &&
    squareY >= inset.top &&
    squareY < height - LABEL_FONT_SIZE * 2 &&
    squareX + squareSize > 80 &&
    squareX < width - 80
  ) {
    guideLabel(
      ctx,
      frame,
      "em square",
      palette.labelText,
      Math.max(squareX, inset.left) + LABEL_GAP,
      squareY + LABEL_FONT_SIZE + LABEL_GAP,
      "left",
    );
  }

  // Advance width: at the top of the view, beside the right edge of the advance box.
  const advanceX = originX + box.advance * scale;
  if (layout && frame.data && advanceX > 0 && advanceX < width) {
    const room = advanceX > 180;
    guideLabel(
      ctx,
      frame,
      `advance width: ${formatFontUnits(box.advance)}`,
      palette.advanceStroke,
      advanceX + (room ? -LABEL_GAP : LABEL_GAP),
      inset.top + LABEL_FONT_SIZE + LABEL_GAP,
      room ? "right" : "left",
    );
  }

  // Bearings: a row of brackets near the top, one span each.
  if (frame.layers.bearings && frame.data && hasInk(box)) {
    paintBearingLabels(ctx, frame, box);
  }

  // Metrics: at the right edge, above each line, with the height it stands for.
  if (frame.layers.metrics && frame.verticals) {
    for (const { name, height: above } of metricLines(frame.verticals)) {
      const y = baselineY - above * scale;
      if (y > LABEL_FONT_SIZE + inset.top && y < height) {
        guideLabel(
          ctx,
          frame,
          `${name}: ${formatFontUnits(above)}`,
          palette.labelText,
          width - LABEL_GAP,
          y - LABEL_GAP,
          "right",
        );
      }
    }
  }

  // Bounding box: below its bottom-right corner, or inside it when there is no room.
  if (frame.layers.bbox && box.inkMaxX > box.inkMinX) {
    const right = originX + box.inkMaxX * scale;
    const bottom = baselineY + box.inkMaxY * scale;
    const below = bottom + LABEL_FONT_SIZE + LABEL_GAP;
    if (right > 100 && right < width + 100 && bottom > 0 && bottom < height) {
      const fits = below < height;
      guideLabel(
        ctx,
        frame,
        "bounding box",
        palette.boundsStroke,
        Math.min(right, width) - LABEL_GAP,
        fits ? below : bottom - LABEL_GAP,
        "right",
      );
    }
  }
  ctx.restore();
}

function paintBoundingBox(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  box: GlyphBox,
) {
  const { scale, x, y } = frame.transform;
  if (box.inkMaxX <= box.inkMinX || box.inkMaxY <= box.inkMinY) return;
  // Its own color: the grey of the frame lines was too faint to find on the glyph.
  ctx.strokeStyle = frame.palette.boundsStroke;
  ctx.setLineDash(frame.palette.dashes.bbox);
  ctx.strokeRect(
    snapToPixelCenter(x + box.inkMinX * scale),
    snapToPixelCenter(y + box.inkMinY * scale),
    (box.inkMaxX - box.inkMinX) * scale,
    (box.inkMaxY - box.inkMinY) * scale,
  );
  ctx.setLineDash([]);
}

/**
 * Side of an on-curve point and diameter of an off-curve one: pixels, whatever
 * the zoom. Both are the same size; solid squares and hollow circles tell them
 * apart.
 */
const ON_CURVE_SIZE = 6;
const OFF_CURVE_RADIUS = ON_CURVE_SIZE / 2;

function paintPoints(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
  points: GlyphPoints,
) {
  const { width, height, palette } = frame;
  const { scale, x: originX, y: originY } = frame.transform;
  const margin = ON_CURVE_SIZE;
  const inView = (x: number, y: number) =>
    x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;

  // Handles first, under the points.
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = palette.handleStroke;
  ctx.beginPath();
  const { handles } = points;
  for (let i = 0; i < handles.length; i += 4) {
    const x1 = originX + handles[i] * scale;
    const y1 = originY + handles[i + 1] * scale;
    const x2 = originX + handles[i + 2] * scale;
    const y2 = originY + handles[i + 3] * scale;
    if (!inView(x1, y1) && !inView(x2, y2)) continue;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.restore();

  // Off-curve points: hollow circles.
  ctx.fillStyle = palette.cardFill;
  ctx.strokeStyle = palette.handleStroke;
  ctx.beginPath();
  const { offCurve } = points;
  for (let i = 0; i < offCurve.length; i += 2) {
    const x = originX + offCurve[i] * scale;
    const y = originY + offCurve[i + 1] * scale;
    if (!inView(x, y)) continue;
    ctx.moveTo(x + OFF_CURVE_RADIUS, y);
    ctx.arc(x, y, OFF_CURVE_RADIUS, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();

  // On-curve points: filled squares with a thin edge in the card color, so they
  // show on the ink as well as beside it.
  ctx.fillStyle = palette.outlineStroke;
  ctx.strokeStyle = palette.cardFill;
  const { onCurve } = points;
  for (let i = 0; i < onCurve.length; i += 2) {
    const x = originX + onCurve[i] * scale;
    const y = originY + onCurve[i + 1] * scale;
    if (!inView(x, y)) continue;
    const left = Math.round(x - ON_CURVE_SIZE / 2);
    const top = Math.round(y - ON_CURVE_SIZE / 2);
    ctx.fillRect(left, top, ON_CURVE_SIZE, ON_CURVE_SIZE);
    ctx.strokeRect(left + 0.5, top + 0.5, ON_CURVE_SIZE - 1, ON_CURVE_SIZE - 1);
  }
}

/** Draw the glyph of `frame` on a canvas whose context is scaled for the pixel ratio. */
export function paintGlyph(
  ctx: CanvasRenderingContext2D,
  frame: GlyphFrame,
): void {
  const { width, height, transform, data, layers, palette } = frame;
  const box = data ?? missingGlyphBox(frame.unitsPerEm);

  ctx.fillStyle = palette.cardFill;
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1;

  if (frame.labels && layers.grid) paintGrid(ctx, frame);
  if (layers.layout) paintLayout(ctx, frame, box);
  // Under the glyph, so the tint never dims the ink.
  if (data && layers.bearings && hasInk(box)) paintBearings(ctx, frame, box);
  if (layers.metrics && frame.verticals) {
    paintMetrics(ctx, frame, frame.verticals);
  }

  if (data && (layers.fill || layers.outline)) {
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);
    if (layers.fill) {
      ctx.fillStyle = palette.glyphFill;
      ctx.fill(data.path);
    }
    if (layers.outline) {
      // The line width is in the scaled space: divide so it stays one pixel.
      ctx.lineWidth = 1 / transform.scale;
      ctx.lineJoin = "round";
      ctx.strokeStyle = palette.outlineStroke;
      ctx.stroke(data.path);
    }
    ctx.restore();
  }

  if (data && layers.bbox) paintBoundingBox(ctx, frame, box);
  // After the glyph, so the words stay readable over it.
  if (frame.labels) paintGuideLabels(ctx, frame, box);
  if (frame.points && layers.points) paintPoints(ctx, frame, frame.points);
  // Last: the strips are over the glyph, its points and its labels.
  if (frame.labels && layers.rulers) paintRulers(ctx, frame);
}
