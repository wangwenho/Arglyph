import type { Font } from "opentype.js";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GlyphGridView } from "../canvas/grid/view.ts";
import { describeFont } from "../core/font/info.ts";
import { glyphStateName } from "../core/glyph/state.ts";
import { FILTER_MAPPED } from "../core/grid/filters.ts";
import { DEFAULT_TARGET_SIZE, stepTargetSize } from "../core/grid/layout.ts";
import type { ViewState } from "../core/grid/view-state.ts";
import { DEFAULT_TEXT_SIZE, stepTextSize } from "../core/text/text.ts";
import { unicodeBlocks } from "../core/unicode/blocks.ts";
import { BlockPicker } from "./components/BlockPicker.tsx";
import { GridEmptyState } from "./components/GridEmptyState.tsx";
import { GridHost } from "./components/GridHost.tsx";
import { GridSizeField } from "./components/GridSizeField.tsx";
import { HelpDialog } from "./components/HelpDialog.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { InspectorSash } from "./components/InspectorSash.tsx";
import { SearchBox } from "./components/SearchBox.tsx";
import { StateFilter } from "./components/StateFilter.tsx";
import { StatsBar, TextStatsBar } from "./components/StatsBar.tsx";
import { TextControls } from "./components/TextControls.tsx";
import { TextHost } from "./components/TextHost.tsx";
import { type Notice, Toolbar } from "./components/Toolbar.tsx";
import { Tooltips } from "./components/Tooltips.tsx";
import { ZoomHost } from "./components/ZoomHost.tsx";
import {
  type SizeKey,
  useGlobalShortcuts,
} from "./hooks/use-global-shortcuts.ts";
import { useGlyphBrowser } from "./hooks/use-glyph-browser.ts";
import { useInspectorPanel } from "./hooks/use-inspector-panel.ts";
import { useMainView } from "./hooks/use-main-view.ts";
import { useSavedState } from "./hooks/use-saved-state.ts";
import { useSelection } from "./hooks/use-selection.ts";
import { useTextView } from "./hooks/use-text-view.ts";
import { useZoom } from "./hooks/use-zoom.ts";
import { glyphMenuContext } from "./lib/glyph-context.ts";
import type { SavedUi } from "./lib/saved-ui.ts";
import type { HelpContext } from "./lib/shortcuts.ts";
import type { View } from "./lib/view-mode.ts";

/** What the page around the app provides. */
export interface AppPorts {
  copyText(text: string): Promise<void>;
  /** The grid exists. May return what to do when it is gone (like an effect). */
  onViewReady?(view: GlyphGridView): (() => void) | undefined;
  onViewStateChange?(state: ViewState): void;
  /** What the interface kept the last time, and where it hands changes to keep. */
  saved?: SavedUi;
  onSavedChange?(patch: SavedUi): void;
  /** Extra toolbar controls (the dev page's file picker). */
  toolbarExtra?: ReactNode;
  /** `undefined`: open when the window is wide enough. */
  inspectorDefault?: boolean;
}

export interface AppProps extends AppPorts {
  font: Font | null;
  fileName: string;
  fileSize: number;
  /** The font file, for the text view: the browser sets the text in it. */
  bytes?: ArrayBuffer | null;
  /** Which glyphs have no outline (see findEmptyGlyphs); null when unknown. */
  emptyGlyphs?: Uint8Array | null;
  restore?: ViewState;
  notice?: Notice;
}

// The layout of the app: what is on the screen and how the parts talk to each
// other. What the grid shows is worked out by useGlyphBrowser; the grid itself,
// a canvas, is drawn by GridHost.
export function App({
  font,
  fileName,
  fileSize,
  bytes,
  emptyGlyphs,
  restore,
  notice,
  copyText,
  onViewReady,
  onViewStateChange,
  saved,
  onSavedChange,
  toolbarExtra,
  inspectorDefault,
}: AppProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<GlyphGridView | null>(null);
  const focusGrid = useCallback(() => viewRef.current?.focus(), []);
  const handleViewReady = useCallback(
    (view: GlyphGridView) => {
      viewRef.current = view;
      return onViewReady?.(view);
    },
    [onViewReady],
  );

  const [glyphSize, changeGlyphSize] = useSavedState(
    "glyphSize",
    DEFAULT_TARGET_SIZE,
    saved,
    onSavedChange,
  );
  // The width the cards are laid out in and the size they came to (the grid says).
  const [gridLayout, setGridLayout] = useState<{
    width: number;
    size: number;
  } | null>(null);

  const inspector = useInspectorPanel({
    root: rootRef,
    body: bodyRef,
    saved,
    onSavedChange,
    openByDefault: inspectorDefault,
  });

  const browser = useGlyphBrowser(font, emptyGlyphs, { saved, onSavedChange });
  const { fullModel, model } = browser;
  const [selectedIndex, selectInModel, selectionSettled] = useSelection(model);
  const fontInfo = useMemo(() => (font ? describeFont(font) : null), [font]);

  const mainView = useMainView(saved);
  const textView = useTextView({
    font,
    bytes,
    fullModel,
    view: mainView.view,
    saved,
    onSavedChange,
  });
  const zoom = useZoom({
    font,
    model,
    fullModel,
    selectedIndex,
    selectionSettled,
    selectInModel,
    grid: viewRef,
    view: mainView.view,
    textView,
    saved,
    onSavedChange,
  });
  const changeView = useCallback(
    (next: View) => {
      if (next === "text") {
        zoom.closeOverGrid();
        textView.enter();
      } else {
        textView.leave();
      }
      mainView.setView(next);
    },
    [zoom.closeOverGrid, textView.enter, textView.leave, mainView.setView],
  );

  // The help window: the keys and gestures, with those of the current view first.
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const helpContext: HelpContext = zoom.target
    ? "zoom"
    : textView.visible
      ? "text"
      : "grid";
  // Cmd+G and Cmd+T: the view that is already shown stays as it is.
  const showView = useCallback(
    (next: View) => {
      if ((next === "text") !== textView.visible) changeView(next);
    },
    [changeView, textView.visible],
  );
  // Cmd with + - 0: the size of what is shown, as the toolbar's − and + do.
  const changeSize = useCallback(
    (key: SizeKey) => {
      if (textView.visible) {
        textView.setSize(
          key === "reset"
            ? DEFAULT_TEXT_SIZE
            : stepTextSize(textView.size, key),
        );
      } else if (key === "reset") {
        changeGlyphSize(DEFAULT_TARGET_SIZE);
      } else if (gridLayout) {
        const next = stepTargetSize(gridLayout.width, glyphSize, key);
        if (next !== null) changeGlyphSize(next);
      }
    },
    [
      textView.visible,
      textView.size,
      textView.setSize,
      gridLayout,
      glyphSize,
      changeGlyphSize,
    ],
  );
  useGlobalShortcuts({
    onHelp: openHelp,
    onView: showView,
    onSize: changeSize,
    onToggleInspector: inspector.toggle,
    search: searchRef,
    searchAvailable: !textView.visible,
    zoomOpen: zoom.target !== null,
  });

  // Back from the zoom view or the text, the keys belong to the grid again.
  // Unless the focus is somewhere else on purpose (the search box was used to
  // leave).
  const covered = zoom.overGrid || textView.visible;
  const wasCovered = useRef(false);
  useEffect(() => {
    const focusLost =
      !document.activeElement || document.activeElement === document.body;
    if (wasCovered.current && !covered && focusLost) focusGrid();
    wasCovered.current = covered;
  }, [covered, focusGrid]);

  // The grid is a canvas: tell a screen reader what is selected.
  const announcement =
    model && selectedIndex >= 0
      ? `${model.labelAt(selectedIndex)}, ${glyphStateName(model.stateAt(selectedIndex))}`
      : "";

  return (
    <div className="app" ref={rootRef}>
      <Toolbar
        view={textView.visible ? "text" : "grid"}
        onViewChange={changeView}
        blockPicker={
          fullModel && (
            <BlockPicker
              blocks={unicodeBlocks}
              coverage={browser.block.coverage}
              totalCount={fullModel.count}
              unmappedCount={browser.block.unmappedCount}
              value={browser.block.value}
              onChange={browser.block.select}
              onCommit={focusGrid}
            />
          )
        }
        stateFilter={
          fullModel && (
            <StateFilter
              value={browser.filter.value}
              onChange={browser.filter.select}
              counts={browser.counts}
              blockChosen={browser.block.chosen}
              outlinesKnown={browser.outlinesKnown}
              onCommit={focusGrid}
            />
          )
        }
        search={
          fullModel && (
            <SearchBox
              inputRef={searchRef}
              initialText={browser.search.text}
              onChange={browser.search.setText}
              onSubmit={() => {
                focusGrid();
                if (model && model.count > 0) viewRef.current?.select(0);
              }}
              onLeave={focusGrid}
            />
          )
        }
        inspectorOpen={inspector.open}
        onToggleInspector={inspector.toggle}
        onHelp={openHelp}
        gridSize={
          <GridSizeField
            size={gridLayout?.size ?? null}
            width={gridLayout?.width ?? 0}
            target={glyphSize}
            onTargetChange={changeGlyphSize}
            // The cards are bigger or smaller: the keys are for the grid again.
            onCommit={focusGrid}
          />
        }
        textControls={
          <TextControls
            size={textView.size}
            onSizeChange={textView.setSize}
            style={textView.style}
            onChange={textView.setStyle}
            onCommit={textView.returnToBox}
          />
        }
        notice={notice}
        extra={toolbarExtra}
      />
      {fullModel && textView.visible && (
        <TextStatsBar
          characters={textView.analysis.characters}
          undrawn={textView.analysis.undrawn}
          missing={textView.analysis.missing}
        />
      )}
      {fullModel && !textView.visible && (
        <StatsBar
          title={browser.summary.title}
          coverage={browser.summary.coverage}
          counts={browser.counts}
          outlinesKnown={browser.outlinesKnown}
          filter={browser.filter.value}
          onFilter={(value) => {
            browser.filter.select(value);
            focusGrid();
          }}
          search={
            browser.search.text.trim() === ""
              ? null
              : {
                  query: browser.search.query,
                  outcome: browser.search.outcome,
                  hint: browser.search.hint,
                }
          }
        />
      )}
      <div className="app-body" ref={bodyRef}>
        <div className="stage">
          {/* Under the zoom view or the text the grid must not take keys or the focus. */}
          <div className="stage-grid" inert={covered}>
            <GridHost
              font={font}
              model={model}
              targetSize={glyphSize}
              restore={restore}
              onSelect={zoom.onSelect}
              onOpen={zoom.openOverGrid}
              onStateChange={onViewStateChange}
              contextOf={(index) => glyphMenuContext(model, index)}
              onLayoutChange={setGridLayout}
              onViewReady={handleViewReady}
            >
              {browser.empty && (
                <GridEmptyState
                  state={browser.empty}
                  onAction={(kind) => {
                    if (kind === "widen-search") {
                      browser.search.widen();
                      focusGrid();
                    } else {
                      browser.filter.select(FILTER_MAPPED);
                    }
                  }}
                />
              )}
            </GridHost>
          </div>
          {textView.visible && (
            <TextHost
              text={textView.text}
              analysis={textView.analysis}
              size={textView.size}
              style={textView.style}
              face={textView.face}
              onTextChange={textView.edit}
              onInspect={textView.inspect}
              onLook={textView.look}
              covered={zoom.overText}
              refocus={textView.returned}
            />
          )}
          {/* After the text, so that it is over it. */}
          {zoom.target && font && (
            <ZoomHost
              font={font}
              glyphIndex={zoom.target.glyphIndex}
              label={zoom.target.label}
              layers={zoom.layers}
              onNavigate={zoom.target.onNavigate}
              onClose={zoom.target.onClose}
              onToggleLayer={zoom.toggleLayer}
            />
          )}
        </div>
        {inspector.open && font && model && fullModel && fontInfo && (
          <Inspector
            font={font}
            // In the text view the inspector is about the whole font, and the
            // character in it that was clicked.
            model={textView.visible ? fullModel : model}
            fontInfo={fontInfo}
            fileName={fileName}
            fileSize={fileSize}
            selectedIndex={
              textView.visible
                ? textView.inspectedCodepoint !== null
                  ? fullModel.indexOfKey(textView.inspectedCodepoint)
                  : -1
                : selectedIndex
            }
            copyText={copyText}
            context={helpContext}
            onHelp={openHelp}
            zoomLayers={
              zoom.target
                ? { layers: zoom.layers, onToggleLayer: zoom.toggleLayer }
                : undefined
            }
            text={
              textView.visible
                ? { character: textView.inspectedCodepoint }
                : undefined
            }
            sash={
              <InspectorSash
                width={inspector.width}
                max={inspector.widest}
                onLive={inspector.showWidth}
                onCommit={inspector.keepWidth}
                onReset={inspector.resetWidth}
              />
            }
          />
        )}
      </div>
      <Tooltips />
      {helpOpen && <HelpDialog context={helpContext} onClose={closeHelp} />}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
