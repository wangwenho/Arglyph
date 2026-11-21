import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  characterNearCaret,
  cssLetterSpacing,
  cssLineHeight,
  MAX_TEXT_LENGTH,
  type TextAnalysis,
  type TextRun,
  type TextStyle,
} from "../../core/text/text.ts";
import { useLinkHover } from "../hooks/use-link-hover.ts";
import type { TextFace } from "../hooks/use-text-face.ts";
import { characterAtPoint } from "../lib/text-hit.ts";
import { OverlayScrollbar } from "./OverlayScrollbar.tsx";

export interface TextHostProps {
  /** What the box starts with. */
  text: string;
  analysis: TextAnalysis;
  /** Pixels. */
  size: number;
  /** Direction, line height and letter spacing. */
  style: TextStyle;
  face: TextFace;
  /** The text was changed (never in the middle of an IME composition). */
  onTextChange(text: string): void;
  /**
   * The side panel is to show a character (where it starts in the text): the
   * one at the caret, or the one under the pointer while Cmd/Ctrl is held. It
   * keeps showing it until another is asked for.
   */
  onInspect(offset: number): void;
  /** The user asked to look closer at a character (Cmd/Ctrl+click, Cmd/Ctrl+Enter). */
  onLook(offset: number): void;
  /** Something is over the text (the zoom view): it must not take keys or the focus. */
  covered: boolean;
  /** A new value gives the keys back to the box (the zoom view closed). */
  refocus: number;
}

/** Why the text may not be in the font yet, or at all; nothing when it is. */
function banner(face: TextFace): ReactNode {
  if (face.status === "failed") {
    return `The browser cannot use this font to set text: ${face.message}`;
  }
  if (face.status !== "ready") return "Loading the font…";
  return null;
}

// `hover` is where, in the text, the character a Cmd/Ctrl+click would look
// closer at starts: it is set apart, so that it can be drawn like a link.
function Runs({
  runs,
  hover,
}: {
  runs: readonly TextRun[];
  hover: number | null;
}) {
  let offset = 0;
  return runs.map((run, i) => {
    const start = offset;
    offset += run.text.length;
    const hovered = hover !== null && hover >= start && hover < offset;
    if (run.mark !== null) {
      return (
        <span
          // The runs of one text never change place, only their content.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          className={`text-mark text-mark-${run.mark}${hovered ? " text-link" : ""}`}
        >
          {run.text}
        </span>
      );
    }
    if (!hovered || hover === null) {
      // biome-ignore lint/suspicious/noArrayIndexKey: see above
      return <span key={i}>{run.text}</span>;
    }
    const at = hover - start;
    const char = String.fromCodePoint(run.text.codePointAt(at) as number);
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: see above
      <span key={i}>
        {run.text.slice(0, at)}
        <span className="text-link">{char}</span>
        {run.text.slice(at + char.length)}
      </span>
    );
  });
}

/** The keys that move the caret, as opposed to typing. */
const CARET_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/** A stretch of the draft, in UTF-16 units: the letters an IME is still building. */
interface Composing {
  start: number;
  end: number;
}

// While an IME builds a character, the copy shows the draft as it is, with the
// letters being built underlined: the box does not draw its own text.
function Draft({
  draft,
  composing,
}: {
  draft: string;
  composing: Composing | null;
}) {
  if (!composing || composing.end <= composing.start) return <>{draft}</>;
  return (
    <>
      {draft.slice(0, composing.start)}
      <span className="text-composing">
        {draft.slice(composing.start, composing.end)}
      </span>
      {draft.slice(composing.end)}
    </>
  );
}

// The text view: one surface to type on, in the font. It is a real <textarea>,
// so the caret, the selection, copy and paste, undo and the IME are the
// browser's own. What is seen, though, is a copy of the text behind it, laid
// out exactly like the box (same font, size, padding, wrapping): there a
// character the font lacks is left blank, with a mark, as in the grid, which
// the box could not do, since the browser draws such a character from another
// font. The copy gives the surface its height, so the two cannot drift apart
// and nothing inside scrolls by itself.
//
// An IME builds a character from letters first (the Bopomofo under the
// underline); the marks wait for the character, as the search box does.
export function TextHost({
  text,
  analysis,
  size,
  style,
  face,
  onTextChange,
  onInspect,
  onLook,
  covered,
  refocus,
}: TextHostProps) {
  const [draft, setDraft] = useState(text);
  const [composing, setComposing] = useState<Composing | null>(null);
  const composingRef = useRef(false);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // With Cmd/Ctrl held, the character under the pointer is drawn like a link and
  // the pointer is a hand: the click will look closer at it.
  const hover = useLinkHover(
    mirrorRef,
    boxRef,
    draft.length,
    !covered && !composing,
  );
  // The side panel shows the character the caret is at, wherever the caret
  // goes: a click, the arrow keys, Home and End, typing. Holding Cmd/Ctrl and
  // pointing at another character shows that one for as long as the key is
  // held, and letting go goes back to the caret's.
  //
  // After typing, the character that matters is the one just written, before
  // the caret; after moving, the one the caret stands before, as in an editor.
  const typedRef = useRef(false);
  const inspectCaret = useEffectEvent(() => {
    const box = boxRef.current;
    if (!box || composingRef.current) return;
    const offset = characterNearCaret(
      box.value,
      box.selectionStart,
      typedRef.current ? "before" : "after",
    );
    if (offset !== null) onInspect(offset);
  });
  useEffect(() => {
    if (covered) return;
    let frame = 0;
    // Dragging a selection or holding a key fires this many times a frame.
    function onSelectionChange() {
      if (document.activeElement !== boxRef.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        inspectCaret();
      });
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      cancelAnimationFrame(frame);
    };
  }, [covered]);
  const wasHovering = useRef(false);
  useEffect(() => {
    if (hover !== null) {
      wasHovering.current = true;
      onInspect(hover);
    } else if (wasHovering.current) {
      wasHovering.current = false;
      inspectCaret();
    }
  }, [hover, onInspect]);

  // Back from the zoom view: the caret is where it was, the box has the keys.
  useEffect(() => {
    if (refocus > 0) boxRef.current?.focus({ preventScroll: true });
  }, [refocus]);
  // What the IME has built so far, as it said in the last compositionupdate.
  const composingText = useRef("");

  function change(input: HTMLTextAreaElement) {
    typedRef.current = true;
    setDraft(input.value);
    if (!composingRef.current) {
      onTextChange(input.value);
      return;
    }
    // The caret is at the end of what is being built.
    const end = input.selectionStart;
    setComposing({ start: end - composingText.current.length, end });
  }

  const message = banner(face);

  return (
    <div
      className={`text-view${style.orientation === "vertical" ? " text-vertical" : ""}`}
      inert={covered}
    >
      {message && <p className="text-banner">{message}</p>}
      <div className="text-scroll-frame">
        <div
          className="text-scroll overlay-scroll"
          ref={scrollRef}
          // The columns of vertical text lie side by side, and a mouse wheel only
          // knows up and down: it walks the columns (down: the next, on the left).
          // A sideways gesture (a trackpad) is left to the browser.
          onWheel={(event) => {
            if (
              style.orientation !== "vertical" ||
              Math.abs(event.deltaY) <= Math.abs(event.deltaX)
            )
              return;
            event.currentTarget.scrollLeft -= event.deltaY;
          }}
        >
          <div
            className={`text-stack${hover !== null ? " text-linking" : ""}`}
            // The font, size and spacing are set on the element (CSSOM), not in a
            // style attribute of the markup: the webview's policy has no
            // 'unsafe-inline'. The box and its copy inherit all of them.
            style={{
              ...(face.status === "ready"
                ? { fontFamily: `"${face.family}"` }
                : {}),
              fontSize: size,
              lineHeight: cssLineHeight(style),
              letterSpacing: cssLetterSpacing(style),
            }}
          >
            <div className="text-mirror" aria-hidden="true" ref={mirrorRef}>
              {composing ? (
                <Draft draft={draft} composing={composing} />
              ) : (
                <Runs runs={analysis.runs} hover={hover} />
              )}
              {/* A line break at the very end has a line of its own in the box;
                without something after it the copy would be a line shorter. */}
              {"​"}
            </div>
            <textarea
              ref={boxRef}
              className="text-input"
              aria-label="Text to try in the font"
              placeholder="Type or paste text to see it in this font"
              maxLength={MAX_TEXT_LENGTH}
              spellCheck={false}
              // Typing is what the view is for.
              // biome-ignore lint/a11y/noAutofocus: the user chose this view to type
              autoFocus
              value={draft}
              onChange={(event) => change(event.target)}
              // A plain click is only a click: it puts the caret. With Cmd or Ctrl
              // held, the character under the pointer is a link (see useLinkHover)
              // and the click looks closer at it (the zoom view opens).
              onClick={(event) => {
                const mirror = mirrorRef.current;
                if (
                  !mirror ||
                  composingRef.current ||
                  !(event.metaKey || event.ctrlKey)
                )
                  return;
                const offset = characterAtPoint(
                  mirror,
                  event.currentTarget,
                  event.clientX,
                  event.clientY,
                  draft.length,
                );
                if (offset !== null) onLook(offset);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  // The same, from the keyboard, for the character at the caret.
                  // Stopped here: the webview would hand the key to VS Code too.
                  event.preventDefault();
                  event.stopPropagation();
                  const offset = characterNearCaret(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart,
                  );
                  if (offset !== null) onLook(offset);
                  return;
                }
                // Moving the caret is not typing: the panel shows the character
                // after it again (the selection change tells the panel).
                if (CARET_KEYS.has(event.key)) typedRef.current = false;
              }}
              onPointerDown={() => {
                typedRef.current = false;
              }}
              onCompositionStart={(event) => {
                composingRef.current = true;
                composingText.current = "";
                const caret = event.currentTarget.selectionStart;
                setComposing({ start: caret, end: caret });
              }}
              onCompositionUpdate={(event) => {
                composingText.current = event.data;
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                setComposing(null);
                onTextChange(event.currentTarget.value);
              }}
            />
          </div>
        </div>
        <OverlayScrollbar target={scrollRef} />
      </div>
    </div>
  );
}
