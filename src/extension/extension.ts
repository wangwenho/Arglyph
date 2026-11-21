import * as vscode from "vscode";
import { describeCopied, readCopyArgument } from "../protocol.ts";
import { FontDocument } from "./font-document.ts";
import { showFont, webviewOptions } from "./font-panel.ts";

// Must match contributes.customEditors[].viewType in package.json exactly.
const FONT_EDITOR_VIEW_TYPE = "wangwenho.arglyph";

// VS Code calls this provider when the user opens a font file:
//   openCustomDocument  -> read the file once and keep watching it; the document
//                          is shared by all editors opened on the same file
//   resolveCustomEditor -> VS Code hands us an empty panel; we fill it in
class FontEditorProvider
  implements vscode.CustomReadonlyEditorProvider<FontDocument>
{
  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  openCustomDocument(uri: vscode.Uri): Promise<FontDocument> {
    return FontDocument.open(uri);
  }

  resolveCustomEditor(
    document: FontDocument,
    panel: vscode.WebviewPanel,
  ): void {
    panel.webview.options = webviewOptions(this.extensionUri);
    showFont(panel, document, this.extensionUri);
  }
}

// "Arglyph: Open Font...": for a font anywhere on disk, in a panel of our own.
// There is no custom editor to own the document here, so the panel does.
async function openFontCommand(extensionUri: vscode.Uri) {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Open Font",
    filters: { Fonts: ["ttf", "otf"] },
  });
  const uri = picked?.[0];
  if (!uri) return;

  try {
    const document = await FontDocument.open(uri);
    const panel = vscode.window.createWebviewPanel(
      "arglyph.preview",
      document.name,
      vscode.ViewColumn.One,
      webviewOptions(extensionUri),
    );
    panel.onDidDispose(() => document.dispose());
    showFont(panel, document, extensionUri);
  } catch (error) {
    vscode.window.showErrorMessage(`Arglyph: could not open font: ${error}`);
  }
}

// "Copy Code Point" and "Copy Character" of the menu over a glyph in the grid
// (package.json, contributes.menus["webview/context"]). VS Code runs them with
// what the webview put in `data-vscode-context`; they are not for the Command
// Palette, where there is no glyph, so an argument that is not ours does nothing.
function copyFromMenu(field: "codePoint" | "character") {
  return async (argument: unknown) => {
    const text = readCopyArgument(argument, field);
    if (text === null) return;
    await vscode.env.clipboard.writeText(text);
    // The status bar, not a notification: a copy is confirmed quietly.
    vscode.window.setStatusBarMessage(describeCopied(field, text), 2000);
  };
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "arglyph.copyCodePoint",
      copyFromMenu("codePoint"),
    ),
    vscode.commands.registerCommand(
      "arglyph.copyCharacter",
      copyFromMenu("character"),
    ),
    vscode.commands.registerCommand("arglyph.open", () =>
      openFontCommand(context.extensionUri),
    ),
    vscode.window.registerCustomEditorProvider(
      FONT_EDITOR_VIEW_TYPE,
      new FontEditorProvider(context.extensionUri),
      // Editors of the same file share one FontDocument (its bytes and its
      // watcher); each has its own panel and its own view state, so a font can
      // be open in two editors side by side.
      { supportsMultipleEditorsPerDocument: true },
    ),
  );
}
