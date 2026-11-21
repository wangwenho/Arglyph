import { basename } from "node:path";
import * as vscode from "vscode";
import { createReloader } from "./reloader.ts";

// The custom editor's "document": one per font file, shared by every editor
// open on that file (VS Code creates it once and calls `dispose` when the last
// editor is closed). It owns what belongs to the file and not to a window: the
// bytes, and the watcher that keeps them current. An editor only shows them.
//
// The bytes are kept in memory because a hidden panel loses its page: when it
// is shown again its webview reloads and asks for the font again.
export class FontDocument implements vscode.CustomDocument {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly watching: vscode.Disposable;

  private readonly availability = new vscode.EventEmitter<boolean>();
  private canRead = true;

  /** Fires when the file changed on disk and `bytes` holds the new content. */
  readonly onDidChange = this.changed.event;

  /**
   * Fires when the file cannot be read any more (deleted, or unreadable after
   * a few tries: `false`), and when it can be read again (`true`). `bytes`
   * keeps the last content meanwhile.
   */
  readonly onDidChangeReadable = this.availability.event;

  readonly uri: vscode.Uri;
  private current: Uint8Array;

  private constructor(uri: vscode.Uri, bytes: Uint8Array) {
    this.uri = uri;
    this.current = bytes;
    const reloader = createReloader({
      source: {
        async stat() {
          const { mtime, size } = await vscode.workspace.fs.stat(uri);
          return { mtime, size };
        },
        read: () => Promise.resolve(vscode.workspace.fs.readFile(uri)),
      },
      current: () => this.current,
      onChange: (bytes) => {
        this.current = bytes;
        this.changed.fire();
      },
      onReadable: (readable) => {
        this.canRead = readable;
        this.availability.fire(readable);
      },
    });
    // An atomic replace (write a temp file, then rename) shows up as a delete
    // and a create, so both events count, not just "change".
    //
    // The file's name is not used as the pattern: a pattern is a glob, and a
    // name like `Roboto[wdth,wght].ttf` (how Google Fonts names a variable font)
    // is not a glob that matches itself, so the watcher would never fire. The
    // folder is watched for anything (not its subfolders), and only events for
    // this file count.
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.joinPath(uri, ".."), "*"),
    );
    const own = (changed: vscode.Uri) => changed.toString() === uri.toString();
    this.watching = vscode.Disposable.from(
      watcher,
      watcher.onDidChange((changed) => own(changed) && reloader.notify()),
      watcher.onDidCreate((changed) => own(changed) && reloader.notify()),
      reloader,
    );
  }

  /** Read the file and start watching it. Rejects when it cannot be read. */
  static async open(uri: vscode.Uri): Promise<FontDocument> {
    return new FontDocument(uri, await vscode.workspace.fs.readFile(uri));
  }

  get name(): string {
    return basename(this.uri.fsPath);
  }

  /** False while the file is gone or unreadable: `bytes` is the last version. */
  get readable(): boolean {
    return this.canRead;
  }

  get bytes(): Uint8Array {
    return this.current;
  }

  dispose(): void {
    this.watching.dispose();
    this.changed.dispose();
    this.availability.dispose();
  }
}
