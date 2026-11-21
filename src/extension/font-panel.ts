import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { readToHost, type ToWebview } from "../protocol.ts";
import type { FontDocument } from "./font-document.ts";
import { buildWebviewHtml } from "./webview-html.ts";

// Where the webview build (vite.webview.config.ts) puts its files.
const WEBVIEW_DIR = ["out", "webview"];

export function webviewOptions(
  extensionUri: vscode.Uri,
): vscode.WebviewOptions {
  return {
    enableScripts: true,
    // Only the build output may be read by the webview, not the whole
    // extension folder or the workspace.
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIR)],
  };
}

/**
 * Fill a panel that already exists with `document`. Shared by both entry
 * points: the "Open Font..." command, which creates the panel itself, and the
 * custom editor, where VS Code creates the panel and hands it over.
 *
 * The panel asks for the font when its page has loaded (`ready`), and again
 * every time it is rebuilt after being hidden, so it always gets the current
 * bytes. A visible panel is also told when the file changes on disk, and when
 * it can no longer be read (or can be again); a hidden one will get the new
 * bytes when it asks.
 */
export function showFont(
  panel: vscode.WebviewPanel,
  document: FontDocument,
  extensionUri: vscode.Uri,
): void {
  const webview = panel.webview;
  const send = (message: ToWebview) => webview.postMessage(message);
  const sendFont = (reload: boolean) =>
    send({
      type: "font",
      name: document.name,
      // slice() copies into a buffer of exactly the right size; a Uint8Array
      // can be a small view into a much larger buffer.
      data: document.bytes.slice().buffer,
      ...(reload ? { reload: true } : {}),
    });

  // Attach the listener before setting the html: the page starts loading as
  // soon as the html is set.
  const subscriptions = vscode.Disposable.from(
    webview.onDidReceiveMessage((raw: unknown) => {
      const message = readToHost(raw);
      if (message?.type === "ready") {
        sendFont(false);
        // A page built after the file went away must still say so.
        if (!document.readable) send({ type: "file-state", readable: false });
      } else if (message?.type === "copy") {
        vscode.env.clipboard.writeText(message.text);
      } else if (message?.type === "error") {
        vscode.window.showErrorMessage(
          `Arglyph: could not read ${message.name}: ${message.message}`,
        );
      }
    }),
    document.onDidChange(() => {
      if (panel.visible) sendFont(true);
    }),
    document.onDidChangeReadable((readable) => {
      if (panel.visible) send({ type: "file-state", readable });
    }),
  );
  panel.onDidDispose(() => subscriptions.dispose());

  const resource = (file: string) =>
    webview
      .asWebviewUri(vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIR, file))
      .toString();
  webview.html = buildWebviewHtml({
    scriptUri: resource("webview.js"),
    styleUri: resource("webview.css"),
    cspSource: webview.cspSource,
    // New for every panel (see webview-html.ts).
    nonce: randomBytes(16).toString("base64"),
  });
}
