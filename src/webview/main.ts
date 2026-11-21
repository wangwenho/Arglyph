import { findEmptyGlyphs } from "../core/font/emptiness.ts";
import { loadFont } from "../core/font/loader.ts";
import type { ViewState } from "../core/grid/view-state.ts";
import "../app/styles/index.css";
import { mountApp } from "../app/mount-app.tsx";
import { isFileStateMessage, isFontMessage, type ToHost } from "../protocol.ts";
import { readSavedUi, readSavedView, writeSavedUi } from "./saved-codec.ts";

// Webview entry point: receives the font from the extension host and shows it.
// The messages are defined in ../protocol.ts.
const vscode = acquireVsCodeApi();
const post = (message: ToHost) => vscode.postMessage(message);

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing");

// Where the user is, so it can be put back afterwards. Two cases:
//   - the webview reloads every time its panel is hidden and shown again: the
//     position is saved with setState (after a short delay) and read back;
//   - the file changed on disk while shown: the position is still in memory.
// The position in the font (which glyph is on top, which is selected) belongs to
// the file; everything else the interface keeps (SavedUi) belongs to the panel.
const SAVE_DELAY_MS = 250;
let currentName = "";
let currentState: ViewState | undefined;
let saved = readSavedUi(vscode.getState());
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () =>
      vscode.setState({
        name: currentName,
        ...currentState,
        ...writeSavedUi(saved),
      }),
    SAVE_DELAY_MS,
  );
}

const app = mountApp(container, {
  copyText(text) {
    post({ type: "copy", text });
    return Promise.resolve();
  },
  saved,
  onSavedChange(patch) {
    saved = { ...saved, ...patch };
    saveSoon();
  },
  onViewStateChange(state) {
    currentState = state;
    saveSoon();
  },
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (isFileStateMessage(message)) {
    // What is shown is the last version the file had: say so until it is back.
    // (The font that follows its return says "Reloaded" in the same place.)
    if (message.readable) app.clearNotice();
    else {
      app.showNotice(
        "File unavailable, showing the last version",
        "error",
        true,
      );
    }
    return;
  }
  if (!isFontMessage(message)) return;
  const reload = message.reload === true;

  try {
    const start = performance.now();
    const font = loadFont(message.data);
    const parsed = performance.now();
    const emptyGlyphs = findEmptyGlyphs(message.data, font.glyphs.length);
    console.info(
      `[arglyph] ${reload ? "reloaded " : ""}${message.name}: ` +
        `${font.glyphs.length} glyphs, ` +
        `${(message.data.byteLength / 1048576).toFixed(1)} MB, ` +
        `parse ${(parsed - start).toFixed(0)} ms, ` +
        `empty-glyph scan ${(performance.now() - parsed).toFixed(1)} ms` +
        (emptyGlyphs ? "" : " (not understood)"),
    );
    currentName = message.name;
    app.showFont(
      font,
      {
        fileName: message.name,
        fileSize: message.data.byteLength,
        bytes: message.data,
        emptyGlyphs,
      },
      reload ? currentState : readSavedView(vscode.getState(), message.name),
    );
    if (reload) {
      app.showNotice(`Reloaded ${new Date().toLocaleTimeString()}`, "info");
    }
  } catch (error) {
    console.error(`[arglyph] failed to load ${message.name}`, error);
    if (reload) {
      // The file was probably caught half-written. Keep showing the previous
      // version; the next change of the file triggers another attempt.
      app.showNotice(
        "Could not reload the file; showing the previous version",
        "error",
      );
      return;
    }
    // Corrupt or unsupported font: tell the host so it can show a message,
    // instead of leaving the user with a blank grid.
    post({
      type: "error",
      name: message.name,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Attach the listener first, then announce readiness: the host only sends the
// font after this message, so it can never arrive before the listener exists.
post({ type: "ready" });
