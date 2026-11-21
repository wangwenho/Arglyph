import { type ReactNode, useEffect, useState } from "react";
import { keepFocus } from "../lib/keep-focus.ts";
import { modifierName } from "../lib/shortcuts.ts";
import type { View } from "../lib/view-mode.ts";

/** A short message in the toolbar ("Reloaded 14:32:05"). */
export interface Notice {
  /** A new id shows the notice again, even when the text is the same. */
  id: number;
  text: string;
  kind: "info" | "error";
  /** Stays until it is cleared, instead of fading out (a state, not an event). */
  persistent?: boolean;
}

const NOTICE_MS = { info: 4000, error: 8000 };

export interface ToolbarProps {
  view: View;
  onViewChange(view: View): void;
  /** The block dropdown, or nothing before a font is shown. */
  blockPicker?: ReactNode;
  /** The dropdown that picks which glyphs (Mapped, Drawn, Undrawn, Missing) to show. */
  stateFilter?: ReactNode;
  /** The search box. */
  search?: ReactNode;
  /** The size of the cards, after them. */
  gridSize?: ReactNode;
  /** What the text view has in their place: how the text is set, the font size too. */
  textControls?: ReactNode;
  inspectorOpen: boolean;
  onToggleInspector(): void;
  /** Open the help window (the keys and gestures). */
  onHelp(): void;
  notice?: Notice;
  /** Extra controls, for the dev page's file picker. */
  extra?: ReactNode;
}

export function Toolbar({
  view,
  onViewChange,
  blockPicker,
  stateFilter,
  search,
  gridSize,
  textControls,
  inspectorOpen,
  onToggleInspector,
  onHelp,
  notice,
  extra,
}: ToolbarProps) {
  // The notice fades out by itself; a newer one (new id) restarts the timer.
  const [visibleId, setVisibleId] = useState<number | null>(null);
  const noticeId = notice?.id;
  const noticeKind = notice?.kind;
  const noticePersistent = notice?.persistent === true;
  useEffect(() => {
    if (noticeId === undefined || noticeKind === undefined) return;
    setVisibleId(noticeId);
    if (noticePersistent) return;
    const timer = setTimeout(() => setVisibleId(null), NOTICE_MS[noticeKind]);
    return () => clearTimeout(timer);
  }, [noticeId, noticeKind, noticePersistent]);

  return (
    <header className="toolbar">
      <fieldset className="segmented">
        <legend className="sr-only">View</legend>
        {(["grid", "text"] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={view === name}
            data-tip={
              name === "grid"
                ? `Browse every glyph as a grid (${modifierName()}+G)`
                : `Type text and see it set in the font (${modifierName()}+T)`
            }
            onMouseDown={keepFocus}
            onClick={() => onViewChange(name)}
          >
            {name === "grid" ? "Grid" : "Text"}
          </button>
        ))}
      </fieldset>
      <hr className="toolbar-divider" aria-orientation="vertical" />
      {/* What the grid shows is chosen here. The text has no use for it: it
          goes, but stays mounted (the search box keeps what was typed), and
          how the text is set takes its place. */}
      <div
        className="toolbar-controls"
        hidden={view === "text"}
        inert={view === "text"}
      >
        {blockPicker}
        {stateFilter}
        {search}
        <span className="toolbar-group">{gridSize}</span>
      </div>
      {view === "text" && (
        <div className="toolbar-controls">{textControls}</div>
      )}
      <span className="toolbar-spacer" />
      {notice && (
        <span
          className={`toolbar-notice toolbar-notice-${notice.kind}`}
          data-visible={visibleId === notice.id}
          role="status"
        >
          {notice.text}
        </span>
      )}
      {extra}
      <button
        type="button"
        className="icon-button"
        aria-label="Keyboard shortcuts and gestures"
        aria-haspopup="dialog"
        data-tip="Show keyboard shortcuts and gestures (?)"
        onMouseDown={keepFocus}
        onClick={onHelp}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="1.65"
            y="1.65"
            width="12.7"
            height="12.7"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M6.2 6.2a1.9 1.9 0 1 1 2.9 1.6c-.7.45-1.1.8-1.1 1.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Toggle inspector"
        aria-pressed={inspectorOpen}
        aria-keyshortcuts={`${modifierName() === "Cmd" ? "Meta" : "Control"}+I`}
        data-tip={`Show or hide the inspector (${modifierName()}+I)`}
        onMouseDown={keepFocus}
        onClick={onToggleInspector}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="1.5"
            y="2.5"
            width="13"
            height="11"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <rect x="9.5" y="3" width="5" height="10" fill="currentColor" />
        </svg>
      </button>
    </header>
  );
}
