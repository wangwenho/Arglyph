import type { Font } from "opentype.js";
import { type ReactNode, useEffect, useEffectEvent, useRef } from "react";
import {
  createGlyphGridView,
  type GlyphGridView,
} from "../../canvas/grid/view.ts";
import type { GridModel } from "../../core/grid/model.ts";
import type { ViewState } from "../../core/grid/view-state.ts";
import { OverlayScrollbar } from "./OverlayScrollbar.tsx";

export interface GridHostProps {
  font: Font | null;
  model: GridModel | null;
  /** The glyph size the user asked for (see computeCardLayout). */
  targetSize: number;
  /** Where to put the view when `font` is shown (after a reload). */
  restore?: ViewState;
  onSelect(index: number): void;
  /** The user asks to look closer at the selected item (Space, double-click). */
  onOpen?(): void;
  onStateChange?(state: ViewState): void;
  /**
   * What to tell VS Code about item `index` (-1: none) when a context menu opens
   * over the grid: the JSON for `data-vscode-context` (see glyph-context.ts).
   */
  contextOf?(index: number): string;
  /** The grid's width and the size its cards came to changed. */
  onLayoutChange?(grid: { width: number; size: number }): void;
  /** The view exists. May return what to do when it is gone (like an effect). */
  onViewReady?(view: GlyphGridView): (() => void) | undefined;
  /** Drawn over the grid (the empty state). */
  children?: ReactNode;
}

// The canvas grid is plain TypeScript (see canvas/grid/view.ts); React only
// provides the three elements it draws into and tells it what to show. The view
// is created in an effect and disposed by its cleanup, so React may mount,
// unmount and mount again (StrictMode does, in development) without leaving a
// second set of listeners behind.
export function GridHost({
  font,
  model,
  targetSize,
  restore,
  onSelect,
  onOpen,
  onStateChange,
  contextOf,
  onLayoutChange,
  onViewReady,
  children,
}: GridHostProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<GlyphGridView | null>(null);

  // The view outlives renders, so it must call the newest callbacks, not the
  // ones from the render it was created in: Effect Events always see the latest.
  const select = useEffectEvent(onSelect);
  const open = useEffectEvent(() => onOpen?.());
  const changeState = useEffectEvent((state: ViewState) =>
    onStateChange?.(state),
  );
  const describe = useEffectEvent((index: number) => contextOf?.(index));
  const changeLayout = useEffectEvent((grid: { width: number; size: number }) =>
    onLayoutChange?.(grid),
  );
  const ready = useEffectEvent((view: GlyphGridView) => onViewReady?.(view));
  const showFont = useEffectEvent(
    (view: GlyphGridView, f: Font, m: GridModel) => view.show(f, m, restore),
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    const spacer = spacerRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !spacer || !canvas) return;
    const view = createGlyphGridView({ viewport, spacer, canvas });
    view.setSelectionObserver(select);
    view.setOpenObserver(open);
    view.setStateObserver(changeState);
    // VS Code reads the attribute as the menu opens, so it is set right here.
    view.setContextMenuObserver((index) => {
      const context = describe(index);
      if (context === undefined) delete viewport.dataset.vscodeContext;
      else viewport.dataset.vscodeContext = context;
    });
    view.setLayoutObserver(changeLayout);
    viewRef.current = view;
    const cleanup = ready(view);
    return () => {
      cleanup?.();
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  // Before the font effect, so the first layout already uses the right size.
  useEffect(() => {
    viewRef.current?.setTargetSize(targetSize);
  }, [targetSize]);

  // The view tells a new font (which gets its saved position back) from a new
  // model of the same font (which starts at the top) by itself.
  useEffect(() => {
    if (font && model && viewRef.current) {
      showFont(viewRef.current, font, model);
    }
  }, [font, model]);

  return (
    <div className="grid-host">
      {/* The cards are drawn on a canvas, so there are no elements for a
          screen reader to walk through: the grid is a widget with its own keys
          (App announces the selected glyph in a live region). */}
      <div
        id="grid-viewport"
        className="overlay-scroll"
        ref={viewportRef}
        role="application"
        aria-label="Glyph grid. The arrow keys move the selection."
      >
        <div id="grid-spacer" ref={spacerRef} />
      </div>
      <canvas id="grid-canvas" ref={canvasRef} />
      <OverlayScrollbar target={viewportRef} />
      {children}
    </div>
  );
}
