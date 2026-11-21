// The messages between the extension host and the webview.
//
// One file, imported by both sides, so they cannot drift apart: the extension
// and the webview are separate bundles, but both are built from the same
// sources. Nothing here may depend on `vscode` or on the DOM.
//
//   Webview -> host
//     ready   The script has loaded and its listener is attached, so the host may
//             send the font now. Sent again every time the webview reloads (a
//             hidden panel loses its page and builds it again when shown).
//     error   The font could not be parsed; the host shows an error message.
//     copy    Put `text` on the clipboard. The host does it because a webview's
//             clipboard API depends on focus and permissions.
//   Context menu (no message: VS Code does the round trip)
//     The Webview describes what is under the pointer in `data-vscode-context`;
//     the commands in package.json's "webview/context" menu get that object as
//     their argument. See GLYPH_MENU_SECTION and readCopyArgument.
//   host -> Webview
//     font    The font file as an ArrayBuffer. `reload` is true when the file
//             changed on disk while the webview was showing it.
//     file-state  Whether the file can be read now. `readable` is false when it
//             was deleted or cannot be read, so the webview says that what it
//             shows is the last version it had; true when it is back.

export interface FontMessage {
  type: "font";
  name: string;
  data: ArrayBuffer;
  /** The file changed on disk; keep the user's place and say so. */
  reload?: boolean;
}

export interface FileStateMessage {
  type: "file-state";
  readable: boolean;
}

export interface ReadyMessage {
  type: "ready";
}

export interface ErrorMessage {
  type: "error";
  name: string;
  message: string;
}

export interface CopyMessage {
  type: "copy";
  text: string;
}

/** What the webview sends to the host. */
export type ToHost = ReadyMessage | ErrorMessage | CopyMessage;

/** What the host sends to the webview. */
export type ToWebview = FontMessage | FileStateMessage;

/** The Webview only copies a code point or a single character; much longer is not ours. */
export const MAX_COPY_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrow an untyped `event.data` in the webview to a font message. */
export function isFontMessage(message: unknown): message is FontMessage {
  return (
    isRecord(message) &&
    message.type === "font" &&
    typeof message.name === "string" &&
    message.data instanceof ArrayBuffer &&
    (message.reload === undefined || typeof message.reload === "boolean")
  );
}

/** Narrow an untyped `event.data` in the webview to a file state message. */
export function isFileStateMessage(
  message: unknown,
): message is FileStateMessage {
  return (
    isRecord(message) &&
    message.type === "file-state" &&
    typeof message.readable === "boolean"
  );
}

/** Check a message that arrived at the host; null for anything that is not one of ours. */
export function readToHost(message: unknown): ToHost | null {
  if (!isRecord(message)) return null;
  switch (message.type) {
    case "ready":
      return { type: "ready" };
    case "error":
      return typeof message.name === "string" &&
        typeof message.message === "string"
        ? { type: "error", name: message.name, message: message.message }
        : null;
    case "copy":
      return typeof message.text === "string" &&
        message.text.length > 0 &&
        message.text.length <= MAX_COPY_LENGTH
        ? { type: "copy", text: message.text }
        : null;
    default:
      return null;
  }
}

// ---- the glyph context menu -------------------------------------------------

/**
 * The `webviewSection` the grid puts in `data-vscode-context` over a glyph.
 * package.json's "webview/context" `when` clauses name it (and the keys below,
 * as `arglyph.hasCharacter`), so they must be changed together.
 */
export const GLYPH_MENU_SECTION = "arglyph.glyph";

/** What the webview puts in `data-vscode-context` over a glyph. */
export interface GlyphMenuContext {
  webviewSection: typeof GLYPH_MENU_SECTION;
  /** `U+XXXX`. */
  codePoint: string;
  /** The character itself; absent when the code point is not one on its own. */
  character?: string;
  /** Whether `character` is there: a `when` clause cannot test for a missing key. */
  "arglyph.hasCharacter": boolean;
  /** Only our two entries: the default Cut/Copy/Paste mean nothing on a canvas. */
  preventDefaultContextMenuItems: true;
}

/**
 * The text a copy command should put on the clipboard, from the argument VS
 * Code gives it (the merged context of the element that was clicked), or null
 * when the argument is not what the webview sets: a command can also be run from
 * the Command Palette or by another extension, with anything.
 */
export function readCopyArgument(
  argument: unknown,
  field: "codePoint" | "character",
): string | null {
  if (!isRecord(argument)) return null;
  const text = argument[field];
  return typeof text === "string" &&
    text.length > 0 &&
    text.length <= MAX_COPY_LENGTH
    ? text
    : null;
}

// Letters, numbers, punctuation and symbols draw something. Everything else
// does not, or not on its own: white space, controls, format characters (zero
// width, bidi), lone combining marks, private use, unassigned.
const DRAWS_SOMETHING = /^[\p{L}\p{N}\p{P}\p{S}]+$/u;

/**
 * What the status bar says after a copy: the text itself, so the two commands
 * read alike ("copied U+4E00", "copied 一"). A character that would show as
 * nothing (or as a box, which is what a private use character is in the UI
 * font) is called "the character" instead.
 */
export function describeCopied(
  field: "codePoint" | "character",
  text: string,
): string {
  if (field === "character" && !DRAWS_SOMETHING.test(text)) {
    return "Arglyph: copied the character";
  }
  return `Arglyph: copied ${text}`;
}
