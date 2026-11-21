// What the zoom view draws besides the glyph's fill.

export interface ZoomLayers {
  /** The glyph filled in. */
  fill: boolean;
  /** The glyph's contours as a thin line. */
  outline: boolean;
  /** The outline's points and the handles between them. */
  points: boolean;
  /** Em square, baseline and the edges of the advance box. */
  layout: boolean;
  /** The space either side of the ink (LSB, RSB), and the width of the ink. */
  bearings: boolean;
  /** Ascender, descender, x-height and cap height. */
  metrics: boolean;
  /** The box around the ink. */
  bbox: boolean;
  /** Numbers along the top and left edges, in font units from the origin and the baseline. */
  rulers: boolean;
  /** Faint lines at the numbered marks of the rulers. */
  grid: boolean;
}

export type ZoomLayer = keyof ZoomLayers;

export const DEFAULT_LAYERS: ZoomLayers = {
  fill: true,
  outline: false,
  points: false,
  layout: true,
  bearings: false,
  metrics: false,
  bbox: false,
  rulers: true,
  grid: false,
};

/** The layers in the order they are listed, with the key that toggles each. */
export const LAYER_LIST: readonly {
  layer: ZoomLayer;
  label: string;
  key: string;
  /** What the layer shows, for its tooltip. */
  tip: string;
  /**
   * "glyph": how the glyph itself is drawn. "lines": measuring lines laid over
   * it. The inspector separates the two groups.
   */
  group: "glyph" | "lines";
}[] = [
  {
    layer: "fill",
    label: "Fill",
    key: "f",
    tip: "The solid shape of the glyph",
    group: "glyph",
  },
  {
    layer: "outline",
    label: "Outline",
    key: "o",
    tip: "The lines of the contours",
    group: "glyph",
  },
  {
    layer: "points",
    label: "Points",
    key: "p",
    tip: "On-curve points (squares), off-curve control points (circles) and their handles",
    group: "glyph",
  },
  {
    layer: "layout",
    label: "Layout",
    key: "l",
    tip: "The em square, the baseline and the advance width, which place the glyph on a line of text",
    group: "lines",
  },
  {
    layer: "bearings",
    label: "Side bearings",
    key: "s",
    tip: "The left and right side bearings (LSB, RSB) and the width of the ink, which add up to the advance width",
    group: "lines",
  },
  {
    layer: "metrics",
    label: "Metrics",
    key: "m",
    tip: "Ascender, descender, x-height and cap height, with their values. They come from the typo metrics, or from hhea when there are none. The Font section lists them all.",
    group: "lines",
  },
  {
    layer: "bbox",
    label: "Bounding box",
    key: "b",
    tip: "The smallest box around the outline, as the inspector gives it",
    group: "lines",
  },
  {
    layer: "rulers",
    label: "Rulers",
    key: "r",
    tip: "Numbers along the top and left edges, in font units: x from the origin, y up from the baseline",
    group: "lines",
  },
  {
    layer: "grid",
    label: "Grid",
    key: "g",
    tip: "Faint lines at the numbered marks of the rulers, spaced by the zoom",
    group: "lines",
  },
];

/** The layer a key toggles, or null. */
export function layerOfKey(key: string): ZoomLayer | null {
  const lower = key.toLowerCase();
  return LAYER_LIST.find((entry) => entry.key === lower)?.layer ?? null;
}
