import type { Font } from "opentype.js";
import { useCallback, useMemo, useState } from "react";
import type { GridModel } from "../../core/grid/model.ts";
import {
  analyzeText,
  DEFAULT_SAMPLE,
  DEFAULT_TEXT_SIZE,
  DEFAULT_TEXT_STYLE,
  type TextAnalysis,
  type TextStyle,
  textCharacterOffsets,
  textMarker,
} from "../../core/text/text.ts";
import type { SavedUi } from "../lib/saved-ui.ts";
import type { View } from "../lib/view-mode.ts";
import { useSavedState } from "./use-saved-state.ts";
import { type TextFace, useTextFace } from "./use-text-face.ts";

const NO_TEXT: TextAnalysis = {
  runs: [],
  characters: 0,
  missing: 0,
  undrawn: 0,
  missingCodepoints: [],
};

export interface TextViewOptions {
  font: Font | null;
  /** The file the font was read from. */
  bytes: ArrayBuffer | null | undefined;
  /** The whole font, to check the text against. */
  fullModel: GridModel | null;
  /** The view the main area shows (see useMainView). */
  view: View;
  /**
   * What was kept the last time: the text, its size and style, and which
   * character the zoom view is on. Changes to the text, its size and its style
   * are handed to `onSavedChange`.
   */
  saved?: SavedUi;
  onSavedChange?(patch: SavedUi): void;
}

export interface TextView {
  /** The text view is what the main area shows. */
  visible: boolean;
  /** The text view is about to be shown: make it ready (the font, the text). */
  enter(): void;
  /** The text view is left: forget which character was being looked at. */
  leave(): void;
  text: string;
  size: number;
  analysis: TextAnalysis;
  face: TextFace;
  /** The user typed. */
  edit(text: string): void;
  setSize(size: number): void;
  /** Direction, line height and letter spacing. */
  style: TextStyle;
  setStyle(style: TextStyle): void;
  /** Where, in `text`, the character the user clicked starts; null for none. */
  inspected: number | null;
  inspect(offset: number | null): void;
  /** The code point of that character, while the text view is shown. */
  inspectedCodepoint: number | null;
  /**
   * Where the character the zoom view shows starts, while it is open over the
   * text; null when it is not. It walks the characters of the text.
   */
  looking: number | null;
  /** The code point of that character, while the text view is shown. */
  lookingCodepoint: number | null;
  look(offset: number): void;
  /** Show the character `delta` characters on (negative: back) in the zoom view. */
  lookNext(delta: -1 | 1): void;
  stopLooking(): void;
  /** Changes when the zoom view closes, so the box can take the keys again. */
  returned: number;
  /** Give the keys back to the box (a field of the toolbar was used). */
  returnToBox(): void;
}

// What the text view needs, apart from how it looks: the text, its size, and
// the font as the browser can set text in it. The text is
// the user's once typed (and kept, so the next time it is theirs); until then,
// and whenever the view is shown with nothing in it, it is the default sample.
export function useTextView({
  font,
  bytes,
  fullModel,
  view,
  saved,
  onSavedChange,
}: TextViewOptions): TextView {
  // null: nothing typed or kept yet, so the first look makes it.
  const [text, setText] = useState<string | null>(saved?.text ?? null);
  const [size, setSize] = useSavedState(
    "textSize",
    DEFAULT_TEXT_SIZE,
    saved,
    onSavedChange,
  );
  const [style, setStyle] = useSavedState(
    "textStyle",
    DEFAULT_TEXT_STYLE,
    saved,
    onSavedChange,
  );
  // The font is handed to the browser when the view is first wanted, not before:
  // most files are only ever looked at as a grid.
  const [wanted, setWanted] = useState(view === "text");
  const [inspected, setInspected] = useState<number | null>(
    saved?.mode?.looking ?? null,
  );
  const [looking, setLooking] = useState<number | null>(
    saved?.mode?.looking ?? null,
  );
  const [returned, setReturned] = useState(0);
  const face = useTextFace(bytes, wanted);

  const analysis = useMemo(
    () =>
      text !== null && fullModel
        ? analyzeText(text, textMarker(fullModel))
        : NO_TEXT,
    [text, fullModel],
  );

  const enter = useCallback(() => {
    setWanted(true);
    // Nothing typed or kept, or cleared: start from the sample.
    if (!text) {
      setText(DEFAULT_SAMPLE);
      // Kept like typed text: the view comes back with the same text.
      onSavedChange?.({ text: DEFAULT_SAMPLE });
    }
  }, [text, onSavedChange]);

  const leave = useCallback(() => {
    setInspected(null);
    setLooking(null);
  }, []);

  const edit = useCallback(
    (value: string) => {
      setText(value);
      // Offsets in the old text mean nothing in the new one.
      setInspected(null);
      onSavedChange?.({ text: value });
    },
    [onSavedChange],
  );

  const look = useCallback((offset: number) => {
    setInspected(offset);
    setLooking(offset);
  }, []);

  const lookNext = useCallback(
    (delta: -1 | 1) => {
      if (looking === null || text === null) return;
      const offsets = textCharacterOffsets(text);
      const at = offsets.indexOf(looking);
      const next =
        offsets[Math.min(offsets.length - 1, Math.max(0, at + delta))];
      if (next !== undefined) look(next);
    },
    [looking, text, look],
  );

  const stopLooking = useCallback(() => {
    setLooking(null);
    setReturned((current) => current + 1);
  }, []);

  const returnToBox = useCallback(
    () => setReturned((current) => current + 1),
    [],
  );

  const visible = view === "text" && font !== null && fullModel !== null;
  const codepointAt = (offset: number | null) =>
    visible && offset !== null
      ? ((text ?? "").codePointAt(offset) ?? null)
      : null;

  return {
    visible,
    enter,
    leave,
    text: text ?? "",
    size,
    analysis,
    face,
    edit,
    setSize,
    style,
    setStyle,
    inspected,
    inspect: setInspected,
    inspectedCodepoint: codepointAt(inspected),
    looking,
    lookingCodepoint: codepointAt(looking),
    look,
    lookNext,
    stopLooking,
    returned,
    returnToBox,
  };
}
