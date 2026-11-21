import { type Ref, useRef, useState } from "react";
import { keepFocus } from "../lib/keep-focus.ts";

export interface SearchBoxProps {
  /** The input element, so the app can move the focus here (Cmd/Ctrl+F). */
  inputRef?: Ref<HTMLInputElement>;
  /** What the box starts with (the search of the last time). */
  initialText?: string;
  /** The text to search for changed (never in the middle of an IME composition). */
  onChange(text: string): void;
  /** Enter: the user is done typing and wants to look at the results. */
  onSubmit(): void;
  /** Escape in an empty box: give the keyboard back to the grid. */
  onLeave(): void;
}

// The single search box: `國`, `U+4E00`, `U+4E00-4E2F`.
//
// While an IME is composing (the Bopomofo or Pinyin letters under the
// underline), the box holds letters that are not what the user is searching
// for: searching them would flash the grid with results for "g", "u", "o" while
// "國" is being typed. So the text is reported only when no composition is in
// progress, and once more when one ends.
export function SearchBox({
  inputRef,
  initialText = "",
  onChange,
  onSubmit,
  onLeave,
}: SearchBoxProps) {
  const [text, setText] = useState(initialText);
  const composing = useRef(false);

  function change(value: string) {
    setText(value);
    if (!composing.current) onChange(value);
  }

  return (
    <span className="search-field">
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="6.5"
          cy="6.5"
          r="4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M10 10l4.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={inputRef}
        type="search"
        className="toolbar-search"
        value={text}
        placeholder="永, U+6C38, U+0041-U+005A"
        aria-label="Search by character or code point"
        data-tip="Search by character (永), code point (U+6C38) or range (U+0041-U+005A). Separate several with spaces."
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => change(event.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          onChange(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          // Enter and Escape that belong to the IME (choosing a candidate,
          // cancelling a composition) are not ours.
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "Escape") {
            if (text === "") onLeave();
            else change("");
          }
        }}
      />
      {/* The browser's own clear mark is light in a dark theme; this one is ours. */}
      {text !== "" && (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear the search"
          data-tip="Clear the search"
          onMouseDown={keepFocus}
          onClick={(event) => {
            change("");
            event.currentTarget.parentElement?.querySelector("input")?.focus();
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M2 2l6 6M8 2L2 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
