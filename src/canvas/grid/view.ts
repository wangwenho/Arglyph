import type { Font } from "opentype.js";
import {
  computeGlyphMetrics,
  type GlyphMetrics,
} from "../../core/font/metrics.ts";
import {
  buildGlyphRenderData,
  GlyphCache,
  type GlyphRenderData,
} from "../../core/glyph/cache.ts";
import {
  type CardLayout,
  computeCardLayout,
  computeRevealScrollTop,
  DEFAULT_TARGET_SIZE,
} from "../../core/grid/layout.ts";
import type { GridModel } from "../../core/grid/model.ts";
import {
  captureViewState,
  restoreScrollTop,
  restoreSelectedIndex,
  type ViewState,
} from "../../core/grid/view-state.ts";
import {
  computeAnchoredScrollTop,
  computeVisibleRange,
  decideLayout,
} from "../../core/grid/virtual.ts";
import { watchDevicePixelRatio } from "../pixel-ratio.ts";
import { getPalette, subscribePalette } from "../theme.ts";
import { attachGridInteraction } from "./interaction.ts";
import { createGridPainter, type GridFrame } from "./painter.ts";

const OVERSCAN = 1;
const GLYPH_CACHE_LIMIT = 2000;

export interface GlyphGridElements {
  viewport: HTMLDivElement;
  spacer: HTMLDivElement;
  canvas: HTMLCanvasElement;
}

export interface GlyphGridView {
  /**
   * Show `model` drawn with `font`. Calling it again with what is shown already
   * does nothing, so it is safe to call from an effect.
   *
   * With a font that is new to the view, the view starts at the top, or where
   * `restore` says it was before (the same glyphs are found again even if the
   * font changed on disk). With the same font and another model (a block, a
   * filter, a search) it starts at the top with nothing selected; the glyph
   * cache is kept, it is per glyph.
   */
  show(font: Font, model: GridModel, restore?: ViewState): void;
  /**
   * The glyph size the user asked for. The cards are made about this big, then
   * stretched a little to fill the width (see computeCardLayout).
   */
  setTargetSize(size: number): void;
  /** Give the grid the keyboard focus (the arrow keys move the selection). */
  focus(): void;
  /** Select item `index` (-1: nothing) and scroll it into view. */
  select(index: number): void;
  /** Called whenever the selected item changes (-1: nothing selected). */
  setSelectionObserver(observer: ((index: number) => void) | null): void;
  /** Called when the user asks to look closer at the selected item (Space, double-click). */
  setOpenObserver(observer: (() => void) | null): void;
  /**
   * Called when a context menu opens over the grid, with the item under the
   * pointer (-1: none), which a right click has selected already.
   */
  setContextMenuObserver(observer: ((index: number) => void) | null): void;
  /** Called after a frame in which the scroll position or selection changed. */
  setStateObserver(observer: ((state: ViewState) => void) | null): void;
  /**
   * Called when the width the cards are laid out in or the size they came to
   * changes (a resize, another target size): what the toolbar shows and steps from.
   */
  setLayoutObserver(
    observer: ((grid: { width: number; size: number }) => void) | null,
  ): void;
  setRenderObserver(observer: ((elapsedMs: number) => void) | null): void;
  takeCacheStats(): { hits: number; misses: number };
  /** Stop listening to everything and let go of what the view holds. */
  dispose(): void;
}

// This file owns the grid's state and decides when to draw. What a frame looks
// like is in painter.ts; what the pointer and keys do is in
// interaction.ts.
export function createGlyphGridView({
  viewport,
  spacer,
  canvas,
}: GlyphGridElements): GlyphGridView {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context is not available");
  const ctx: CanvasRenderingContext2D = context;
  const paint = createGridPainter(ctx);

  let model: GridModel | null = null;
  let cache: GlyphCache<GlyphRenderData> | null = null;
  let font: Font | null = null;
  let glyphMetrics: GlyphMetrics = { scale: 0, ascent: 0 };
  let targetSize = DEFAULT_TARGET_SIZE;
  let cardLayout: CardLayout = computeCardLayout(
    DEFAULT_TARGET_SIZE,
    DEFAULT_TARGET_SIZE,
  );
  let itemCount = 0;
  let layoutObserver: ((grid: { width: number; size: number }) => void) | null =
    null;
  let announcedWidth = -1;
  let announcedSize = -1;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let usedDevicePixelRatio = 0;
  let usedTargetSize = 0;
  let palette = getPalette();
  let hoverIndex = -1;
  let selectedIndex = -1;
  // True from setFont() until the first layout of the new font has run. The
  // layout can be postponed (e.g. the panel is hidden), so this must outlive
  // the setFont() call.
  let resetPending = false;
  let scheduled = false;
  let frameHandle = 0;
  let disposed = false;
  // Where the next "reset" layout puts the scroll position (the top unless
  // restoring). Kept until that layout has run: it can be postponed.
  let pendingRestore: ViewState | null = null;
  let renderObserver: ((elapsedMs: number) => void) | null = null;
  let selectionObserver: ((index: number) => void) | null = null;
  let openObserver: (() => void) | null = null;
  let contextMenuObserver: ((index: number) => void) | null = null;
  let stateObserver: ((state: ViewState) => void) | null = null;
  let notifiedScrollTop = -1;
  let notifiedSelectedIndex = -2;

  // Updated in place before every frame so drawing allocates nothing.
  const frame: GridFrame = {
    width: 0,
    height: 0,
    scrollTop: 0,
    layout: cardLayout,
    palette,
    firstIndex: 0,
    endIndex: 0,
    model: null,
    cache: null,
    metrics: glyphMetrics,
    hoverIndex: -1,
    selectedIndex: -1,
  };

  function render() {
    const start = performance.now();
    scheduled = false;
    if (disposed) return;
    const scrollTop = viewport.scrollTop;
    const { firstRow, lastRow } = computeVisibleRange({
      scrollTop,
      viewportHeight,
      layout: cardLayout,
      itemCount,
      overscan: OVERSCAN,
    });
    const cols = cardLayout.cols;
    frame.width = viewportWidth;
    frame.height = viewportHeight;
    frame.scrollTop = scrollTop;
    frame.layout = cardLayout;
    frame.palette = palette;
    frame.firstIndex = firstRow * cols;
    frame.endIndex = Math.min(itemCount, (lastRow + 1) * cols);
    frame.model = model;
    frame.cache = cache;
    frame.metrics = glyphMetrics;
    frame.hoverIndex = hoverIndex;
    frame.selectedIndex = selectedIndex;
    paint(frame);
    if (
      stateObserver &&
      model &&
      (scrollTop !== notifiedScrollTop ||
        selectedIndex !== notifiedSelectedIndex)
    ) {
      notifiedScrollTop = scrollTop;
      notifiedSelectedIndex = selectedIndex;
      stateObserver(
        captureViewState(model, cardLayout, scrollTop, selectedIndex),
      );
    }
    renderObserver?.(performance.now() - start);
  }

  function requestRender() {
    if (scheduled || disposed) return;
    scheduled = true;
    frameHandle = requestAnimationFrame(render);
  }

  viewport.addEventListener("scroll", requestRender);

  // The theme changed (the user switched between a light and a dark theme).
  const unsubscribePalette = subscribePalette(() => {
    palette = getPalette();
    requestRender();
  });

  const detachInteraction = attachGridInteraction({
    viewport,
    layout: () => cardLayout,
    itemCount: () => itemCount,
    selectedIndex: () => selectedIndex,
    setHover(index) {
      if (index === hoverIndex) return;
      hoverIndex = index;
      requestRender();
    },
    setSelected(index) {
      if (index === selectedIndex) return;
      selectedIndex = index;
      selectionObserver?.(index);
      requestRender();
    },
    open() {
      openObserver?.();
    },
    contextMenu(index) {
      contextMenuObserver?.(index);
    },
  });

  // Re-measure the viewport and the device pixel ratio, resize the canvas and
  // the spacer, then redraw. What to do (and whether to do anything) is decided
  // by the pure function decideLayout().
  function layout() {
    if (disposed) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;
    const decision = decideLayout({
      current: { width, height, devicePixelRatio, targetSize },
      last: {
        width: viewportWidth,
        height: viewportHeight,
        devicePixelRatio: usedDevicePixelRatio,
        targetSize: usedTargetSize,
      },
      resetPending,
    });
    if (decision === "skip") return;

    // Read the scroll position before the spacer changes: the browser clamps
    // scrollTop as soon as the content gets shorter.
    const previousScrollTop = viewport.scrollTop;
    const previousLayout = cardLayout;

    viewportWidth = width;
    viewportHeight = height;
    usedDevicePixelRatio = devicePixelRatio;
    usedTargetSize = targetSize;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    cardLayout = computeCardLayout(width, targetSize);
    if (width !== announcedWidth || cardLayout.size !== announcedSize) {
      announcedWidth = width;
      announcedSize = cardLayout.size;
      layoutObserver?.({ width, size: cardLayout.size });
    }
    // The glyphs are drawn at the size of the em square, so their scale follows.
    if (font) glyphMetrics = computeGlyphMetrics(font, cardLayout.size);
    const totalRows = Math.ceil(itemCount / cardLayout.cols);
    spacer.style.height = `${totalRows * cardLayout.cardHeight}px`;

    viewport.scrollTop =
      decision === "reset"
        ? model && pendingRestore
          ? restoreScrollTop(model, cardLayout, pendingRestore)
          : 0
        : computeAnchoredScrollTop({
            scrollTop: previousScrollTop,
            previous: previousLayout,
            next: cardLayout,
          });
    resetPending = false;
    pendingRestore = null;
    render();
  }

  // The viewport size changed (dragging a split pane, resizing the window).
  // ResizeObserver notifies at most once per frame, so no extra throttling.
  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(viewport);

  // Moving to a screen with a different pixel ratio, or zooming the page, does
  // not always trigger ResizeObserver, so listen for it separately.
  const stopWatchingPixelRatio = watchDevicePixelRatio(layout);

  return {
    show(newFont, newModel, restore) {
      if (newFont === font && newModel === model) return;
      if (newFont !== font) {
        font = newFont;
        glyphMetrics = computeGlyphMetrics(newFont, cardLayout.size);
        cache = new GlyphCache(GLYPH_CACHE_LIMIT, (glyphIndex) =>
          buildGlyphRenderData(newFont, glyphIndex),
        );
        // The selected glyph is found again by its key; -1 if it is gone.
        selectedIndex = restore ? restoreSelectedIndex(newModel, restore) : -1;
        pendingRestore = restore ?? null;
      } else {
        selectedIndex = -1;
        pendingRestore = null;
        // The saved position names items of the old model; report it again even
        // if the scroll offset happens to be the same (0 before and after).
        notifiedScrollTop = -1;
      }
      model = newModel;
      itemCount = newModel.count;
      hoverIndex = -1;
      selectionObserver?.(selectedIndex);
      resetPending = true;
      layout();
    },
    setTargetSize(size) {
      if (size === targetSize) return;
      targetSize = size;
      layout();
    },
    focus() {
      viewport.focus({ preventScroll: true });
    },
    select(index) {
      if (index < -1 || index >= itemCount) return;
      selectedIndex = index;
      selectionObserver?.(index);
      if (index >= 0) {
        viewport.scrollTop = computeRevealScrollTop(
          index,
          cardLayout,
          viewport.scrollTop,
          viewport.clientHeight,
        );
      }
      requestRender();
    },
    setSelectionObserver(observer) {
      selectionObserver = observer;
    },
    setOpenObserver(observer) {
      openObserver = observer;
    },
    setContextMenuObserver(observer) {
      contextMenuObserver = observer;
    },
    setStateObserver(observer) {
      stateObserver = observer;
    },
    setLayoutObserver(observer) {
      layoutObserver = observer;
      // The layout may have run before anyone listened.
      if (observer && announcedWidth >= 0) {
        observer({ width: announcedWidth, size: announcedSize });
      }
    },
    setRenderObserver(observer) {
      renderObserver = observer;
    },
    takeCacheStats() {
      return cache?.takeStats() ?? { hits: 0, misses: 0 };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameHandle);
      viewport.removeEventListener("scroll", requestRender);
      unsubscribePalette();
      detachInteraction();
      resizeObserver.disconnect();
      stopWatchingPixelRatio();
      selectionObserver = null;
      openObserver = null;
      contextMenuObserver = null;
      stateObserver = null;
      renderObserver = null;
      model = null;
      cache = null;
    },
  };
}
