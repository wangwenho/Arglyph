import type { Font } from "opentype.js";
import { type ReactNode, useMemo, useRef } from "react";
import type { FontInfo } from "../../core/font/info.ts";
import { buildGlyphRenderData } from "../../core/glyph/cache.ts";
import { codepointToCharacter, describeGlyph } from "../../core/glyph/info.ts";
import { formatGlyphLabel } from "../../core/glyph/label.ts";
import {
  GLYPH_BLANK,
  GLYPH_MISSING,
  GLYPH_UNDRAWN,
  type GlyphState,
  glyphStateHint,
  glyphStateName,
} from "../../core/glyph/state.ts";
import type { GridModel } from "../../core/grid/model.ts";
import { blockIndexOf, unicodeBlocks } from "../../core/unicode/blocks.ts";
import {
  codepointKind,
  isExpectedKind,
} from "../../core/unicode/categories.ts";
import {
  LAYER_LIST,
  type ZoomLayer,
  type ZoomLayers,
} from "../../core/zoom/layers.ts";
import { buildGlyphPoints } from "../../core/zoom/points.ts";
import { formatCount } from "../lib/format.ts";
import {
  contextHint,
  type HelpContext,
  modifierName,
} from "../lib/shortcuts.ts";
import { SWATCH } from "../lib/state-swatch.ts";
import { CopyButton } from "./CopyButton.tsx";
import { GlyphPreview } from "./GlyphPreview.tsx";
import { OverlayScrollbar } from "./OverlayScrollbar.tsx";

export interface InspectorProps {
  font: Font;
  model: GridModel;
  fontInfo: FontInfo;
  fileName: string;
  fileSize: number;
  selectedIndex: number;
  copyText(text: string): Promise<void>;
  /**
   * The text view is shown: the inspector is about the character the user is
   * looking at in it, when there is one (then `model` is the whole font, and
   * `selectedIndex` is where it is in it, -1 if the font does not have it).
   */
  text?: { character: number | null };
  /** Where the user is, for the line about the keys; and how to open all of them. */
  context: HelpContext;
  onHelp(): void;
  /** The handle that resizes the panel, on its left edge. */
  sash?: ReactNode;
  /** The zoom view is open: its layer switches take the place of the small preview. */
  zoomLayers?: {
    layers: ZoomLayers;
    onToggleLayer(layer: ZoomLayer): void;
  };
}

/**
 * One fact. `note` is the quieter second half of it (the same length in em, how
 * the points divide): muted and set apart by space, not by brackets.
 */
function Row({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  if (value === "") return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value}
        {/* A real space: read or copied, the note must not run into the value. */}
        {note && " "}
        {note && <span className="note">{note}</span>}
      </dd>
    </>
  );
}

/**
 * The character itself, in the interface's font: for a glyph the font does not
 * draw or does not have, this is the only way to see which character it is.
 * "" when there is nothing to see (a control character, white space).
 */
function characterOf(codepoint: number): string {
  const char = codepointToCharacter(codepoint);
  return char === null || /^[\p{Cc}\p{Z}]$/u.test(char) ? "" : char;
}

// The state in the same words and the same color as the stats line.
function StatusRows({ state }: { state: GlyphState }) {
  return (
    <>
      <dt>Status</dt>
      <dd
        className={`status-value${state === GLYPH_UNDRAWN ? " status-undrawn" : ""}`}
      >
        <i className={`swatch ${SWATCH[state]}`} aria-hidden="true" />
        {glyphStateName(state)}
      </dd>
    </>
  );
}

// When there is something to explain, one sentence saying what the state means.
function StatusHint({ state }: { state: GlyphState }) {
  const explained =
    state === GLYPH_BLANK || state === GLYPH_UNDRAWN || state === GLYPH_MISSING;
  return explained ? (
    <p className="state-hint">{glyphStateHint(state)}</p>
  ) : null;
}

/** The Unicode block of a code point, "" for none (a glyph without a code point). */
function blockName(codepoint: number): string {
  return codepoint < 0
    ? ""
    : (unicodeBlocks[blockIndexOf(codepoint)]?.name ?? "");
}

/** A length in font units, with the same length in em as its note. "" for no length. */
function lengthRow(
  units: number | null,
  unitsPerEm: number,
): { value: string; note?: string } {
  if (units === null) return { value: "" };
  const value = Number.isInteger(units) ? String(units) : units.toFixed(1);
  // Three decimals: a bearing of 4 units is 0.004 em, which two would show as 0.00.
  return { value, note: `${(units / unitsPerEm).toFixed(3)} em` };
}

// An ascender and a descender as the font gives them, in font units; the
// descender is below the baseline. The note "used" marks the set the em square and the
// Metrics layer are drawn from.
function metricSetRow(
  set: { ascender: number; descender: number } | null,
  used: boolean,
): { value: string; note?: string } {
  if (set === null) return { value: "" };
  return {
    value: `${set.ascender} / ${String(set.descender).replace("-", "−")}`,
    note: used ? "used" : undefined,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// What the zoom view draws. The keys work while the view has the focus, which
// is why they are shown: the inspector may be closed in a narrow panel.
function LayerSwitches({
  layers,
  onToggleLayer,
}: {
  layers: ZoomLayers;
  onToggleLayer(layer: ZoomLayer): void;
}) {
  return (
    <ul className="layer-list" aria-label="Layers">
      {LAYER_LIST.map(({ layer, label, key, tip, group }, i) => (
        <li
          key={layer}
          // How the glyph is drawn, then the lines laid over it: a rule between.
          className={
            i > 0 && group !== LAYER_LIST[i - 1].group
              ? "layer-group-start"
              : undefined
          }
        >
          <label data-tip={tip}>
            <input
              type="checkbox"
              checked={layers[layer]}
              onChange={() => onToggleLayer(layer)}
            />
            {label}
            <kbd className="layer-key">{key.toUpperCase()}</kbd>
          </label>
        </li>
      ))}
    </ul>
  );
}

function GlyphSection({
  font,
  model,
  fontInfo,
  selectedIndex,
  copyText,
  zoomLayers,
}: Pick<
  InspectorProps,
  "font" | "model" | "fontInfo" | "selectedIndex" | "copyText" | "zoomLayers"
>) {
  const data = useMemo(
    () => buildGlyphRenderData(font, model.glyphIndexAt(selectedIndex)),
    [font, model, selectedIndex],
  );
  const info = describeGlyph(model, selectedIndex, data);
  const { unitsPerEm } = fontInfo;
  // How the outline is built, for the zoom view: a font's quality shows in it.
  const glyphIndex = model.glyphIndexAt(selectedIndex);
  const points = useMemo(
    () => (zoomLayers ? buildGlyphPoints(font, glyphIndex) : null),
    [zoomLayers, font, glyphIndex],
  );

  return (
    <section className="inspector-section">
      <h2>Glyph</h2>
      {!zoomLayers && <GlyphPreview font={font} data={data} />}
      <p className="glyph-label">{info.label}</p>
      <dl className="rows">
        <StatusRows state={info.state} />
        <Row label="Character" value={characterOf(info.codepoint)} />
        <Row label="Block" value={blockName(info.codepoint)} />
        <Row label="Glyph index" value={String(info.glyphIndex)} />
        <Row label="Advance width" {...lengthRow(info.advance, unitsPerEm)} />
        <Row
          label="Left side bearing"
          {...lengthRow(info.leftBearing, unitsPerEm)}
        />
        <Row
          label="Glyph width"
          {...lengthRow(
            info.boundingBox === null
              ? null
              : info.boundingBox.xMax - info.boundingBox.xMin,
            unitsPerEm,
          )}
        />
        <Row
          label="Right side bearing"
          {...lengthRow(info.rightBearing, unitsPerEm)}
        />
        <Row
          label="Bounding box"
          value={
            info.boundingBox === null
              ? ""
              : `x ${info.boundingBox.xMin} to ${info.boundingBox.xMax}, y ${info.boundingBox.yMin} to ${info.boundingBox.yMax}`
          }
        />
        {points && <Row label="Contours" value={String(points.contours)} />}
        {points && (
          <Row
            label="Points"
            value={String((points.onCurve.length + points.offCurve.length) / 2)}
            note={`${points.onCurve.length / 2} on · ${points.offCurve.length / 2} off`}
          />
        )}
      </dl>
      <StatusHint state={info.state} />
      {info.codepoint >= 0 && (
        <div className="button-row">
          <CopyButton
            label="Copy code point"
            text={info.label}
            copyText={copyText}
          />
          {info.character !== null && (
            <CopyButton
              label="Copy character"
              text={info.character}
              copyText={copyText}
            />
          )}
        </div>
      )}
    </section>
  );
}

// A character the font has no glyph for: a cell of the "include missing" view,
// or a character of the typed text. There is no glyph to describe, only what can
// be said about the gap.
function MissingSection({
  codepoint,
  copyText,
}: {
  codepoint: number;
  copyText(text: string): Promise<void>;
}) {
  const label = formatGlyphLabel(codepoint, -1);
  const character = codepointToCharacter(codepoint);
  // A control or a private-use character is not one a font is expected to have.
  const state = isExpectedKind(codepointKind(codepoint))
    ? GLYPH_MISSING
    : GLYPH_BLANK;
  return (
    <section className="inspector-section">
      <h2>Glyph</h2>
      <p className="glyph-label">{label}</p>
      <dl className="rows">
        <StatusRows state={state} />
        <Row label="Character" value={characterOf(codepoint)} />
        <Row label="Block" value={blockName(codepoint)} />
      </dl>
      <StatusHint state={state} />
      <div className="button-row">
        <CopyButton label="Copy code point" text={label} copyText={copyText} />
        {character !== null && (
          <CopyButton
            label="Copy character"
            text={character}
            copyText={copyText}
          />
        )}
      </div>
    </section>
  );
}

// Nothing to show yet.
function NoSelection() {
  return (
    <section className="inspector-section">
      <h2>Glyph</h2>
      <p className="placeholder">Select a glyph to see its details.</p>
    </section>
  );
}

// What the keys are for where the user is, in a line, and the way to all of
// them. The same list is in the help window (shortcuts.ts).
function ShortcutHint({
  context,
  onHelp,
}: Pick<InspectorProps, "context" | "onHelp">) {
  return (
    <footer className="shortcut-footer">
      <p className="shortcut-hint">{contextHint(context, modifierName())}</p>
      <button type="button" className="hint-link" onClick={onHelp}>
        All shortcuts <kbd>?</kbd>
      </button>
    </footer>
  );
}

export function Inspector(props: InspectorProps) {
  const { fontInfo, fileName, fileSize, selectedIndex } = props;
  const scrollRef = useRef<HTMLElement>(null);
  return (
    <div className="inspector-frame">
      {props.sash}
      <aside
        className="inspector overlay-scroll"
        aria-label="Inspector"
        ref={scrollRef}
      >
        {props.text ? (
          props.text.character === null ? (
            <NoSelection />
          ) : selectedIndex >= 0 ? (
            <GlyphSection {...props} />
          ) : (
            <MissingSection
              codepoint={props.text.character}
              copyText={props.copyText}
            />
          )
        ) : selectedIndex >= 0 ? (
          props.model.glyphIndexAt(selectedIndex) < 0 ? (
            <MissingSection
              codepoint={props.model.codepointAt(selectedIndex)}
              copyText={props.copyText}
            />
          ) : (
            <GlyphSection {...props} />
          )
        ) : (
          <NoSelection />
        )}
        {props.zoomLayers && (
          <details className="inspector-section" open>
            <summary>
              <h2>Layers</h2>
            </summary>
            <LayerSwitches {...props.zoomLayers} />
          </details>
        )}
        <details className="inspector-section" open>
          <summary>
            <h2>Font</h2>
          </summary>
          <dl className="rows">
            <Row label="Family" value={fontInfo.family} />
            <Row label="Style" value={fontInfo.style} />
            <Row label="Full name" value={fontInfo.fullName} />
            <Row label="Version" value={fontInfo.version} />
            <Row label="Format" value={fontInfo.format} />
            <Row label="Variable" value={fontInfo.variable ? "Yes" : ""} />
            <Row label="Units per em" value={String(fontInfo.unitsPerEm)} />
            <Row
              label="Typo metrics"
              {...metricSetRow(
                fontInfo.verticals.typo,
                fontInfo.verticals.used === "typo",
              )}
            />
            <Row
              label="hhea metrics"
              {...metricSetRow(
                fontInfo.verticals.hhea,
                fontInfo.verticals.used === "hhea",
              )}
            />
            <Row
              label="Win metrics"
              {...metricSetRow(fontInfo.verticals.win, false)}
            />
            <Row
              label="x-height"
              value={
                fontInfo.verticals.xHeight === null
                  ? ""
                  : String(fontInfo.verticals.xHeight)
              }
            />
            <Row
              label="Cap height"
              value={
                fontInfo.verticals.capHeight === null
                  ? ""
                  : String(fontInfo.verticals.capHeight)
              }
            />
            <Row label="Glyphs" value={formatCount(fontInfo.glyphCount)} />
            <Row
              label="Code points"
              value={formatCount(fontInfo.codepointCount)}
            />
            <Row label="File" value={fileName} />
            <Row label="Size" value={formatFileSize(fileSize)} />
            {/* The credits come last: they run to many lines and would push
                everything else down. */}
            <Row label="Designer" value={fontInfo.designer} />
            <Row label="Manufacturer" value={fontInfo.manufacturer} />
            <Row label="Copyright" value={fontInfo.copyright} />
            <Row label="License" value={fontInfo.license} />
          </dl>
        </details>
        <ShortcutHint context={props.context} onHelp={props.onHelp} />
      </aside>
      <OverlayScrollbar target={scrollRef} />
    </div>
  );
}
