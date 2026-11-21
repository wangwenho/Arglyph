// The real extension bundle (out/extension.cjs) against a fake `vscode` module.
//
//   pnpm e2e:host
//
// The unit tests cover the logic of the extension host (the reloader, the page,
// the protocol), but not how it is wired to VS Code: what the custom editor
// provider returns, what a panel is told and when, what is released when. That
// wiring can only be exercised with something that looks like VS Code, so this
// supplies just enough of it (a file system, a file watcher, panels, a
// clipboard) and runs the scenarios a user would: two editors on one file, a
// hidden editor, a file changing on disk (touched, truncated, replaced), the
// clipboard, closing editors, the "Open Font..." command.
//
// It uses real timers (the reloader waits 300 ms for a file to be quiet), so it
// takes a few seconds.
//
// A .cts file: CommonJS, because it hooks Node's `require` to hand the bundle
// this fake when it asks for "vscode". Node strips the types, and strips no
// more than that, so the modules come in with `require` (`import` would be ES
// module syntax in a CommonJS file) and are given their types by hand.

const Module = require("node:module") as typeof import("node:module") & {
  _load(request: string, ...rest: unknown[]): unknown;
};
const fs: typeof import("node:fs") = require("node:fs");
const os: typeof import("node:os") = require("node:os");
const path: typeof import("node:path") = require("node:path");
const assert: typeof import("node:assert") = require("node:assert");

// ---- the shapes of the fake -----------------------------------------------

interface FakeUri {
  fsPath: string;
  path: string;
  scheme: string;
  toString(): string;
}

type Listener<T> = (value: T) => void;
interface Subscription {
  dispose(): void;
}

/** What the webview is sent: the font, whose bytes and `reload` the checks read. */
interface Sent {
  type: string;
  name?: string;
  data: ArrayBuffer;
  reload?: boolean;
}

interface WebviewOptions {
  enableScripts: boolean;
  localResourceRoots: FakeUri[];
}

interface Watcher {
  pattern: RelativePattern;
  disposed: boolean;
  change: EventEmitter<FakeUri>;
  create: EventEmitter<FakeUri>;
  onDidChange: EventEmitter<FakeUri>["event"];
  onDidCreate: EventEmitter<FakeUri>["event"];
  dispose(): void;
}

interface Panel {
  visible: boolean;
  title?: string;
  options?: WebviewOptions;
  sent: Sent[];
  webview: {
    options: WebviewOptions | undefined;
    html: string;
    cspSource: string;
    asWebviewUri(uri: FakeUri): { toString(): string };
    postMessage(message: Sent): Promise<boolean>;
    onDidReceiveMessage: EventEmitter<unknown>["event"];
  };
  onDidDispose: EventEmitter<undefined>["event"];
  /** The webview posts `message` to the host. */
  receive(message: unknown): void;
  /** VS Code closes the panel. */
  close(): void;
  /** How many listeners the host still has on the webview's messages. */
  recvListeners(): number;
}

interface FakeDocument {
  name: string;
  bytes: Uint8Array;
  dispose(): void;
}

interface Provider {
  openCustomDocument(uri: FakeUri): Promise<FakeDocument>;
  resolveCustomEditor(document: FakeDocument, panel: Panel): void;
}

// ---- the fake --------------------------------------------------------------

const log = {
  watchers: [] as Watcher[],
  panels: [] as Panel[],
  errors: [] as string[],
  clipboard: [] as string[],
  status: [] as string[],
  commands: new Map<string, (argument?: unknown) => unknown>(),
  provider: null as Provider | null,
  providerOptions: null as {
    supportsMultipleEditorsPerDocument?: boolean;
  } | null,
  viewType: "",
};

class EventEmitter<T = undefined> {
  l = new Set<Listener<T>>();
  event = (fn: Listener<T>): Subscription => {
    this.l.add(fn);
    return { dispose: () => void this.l.delete(fn) };
  };
  fire(v?: T) {
    for (const fn of [...this.l]) fn(v as T);
  }
  dispose() {
    this.l.clear();
  }
}
const Disposable = {
  from: (...ds: (Partial<Subscription> | undefined)[]): Subscription => ({
    dispose() {
      for (const d of ds) d?.dispose?.();
    },
  }),
};
const Uri = {
  file: (p: string): FakeUri => ({
    fsPath: p,
    path: p,
    scheme: "file",
    toString: () => `file://${p}`,
  }),
  joinPath: (u: FakeUri, ...parts: string[]): FakeUri =>
    Uri.file(path.join(u.fsPath, ...parts)),
};
class RelativePattern {
  base: FakeUri;
  pattern: string;
  constructor(base: FakeUri, pattern: string) {
    this.base = base;
    this.pattern = pattern;
  }
}
let nextOpenDialog: FakeUri[] | undefined = [];
const vscode = {
  EventEmitter,
  Disposable,
  Uri,
  RelativePattern,
  ViewColumn: { One: 1 },
  commands: {
    registerCommand: (id: string, fn: (argument?: unknown) => unknown) => {
      log.commands.set(id, fn);
      return { dispose() {} };
    },
  },
  env: {
    clipboard: {
      writeText: (t: string) => {
        log.clipboard.push(t);
        return Promise.resolve();
      },
    },
  },
  workspace: {
    fs: {
      readFile: async (u: FakeUri) => new Uint8Array(fs.readFileSync(u.fsPath)),
      stat: async (u: FakeUri) => {
        const s = fs.statSync(u.fsPath);
        return { mtime: s.mtimeMs, size: s.size };
      },
    },
    createFileSystemWatcher: (pattern: RelativePattern) => {
      const change = new EventEmitter<FakeUri>();
      const create = new EventEmitter<FakeUri>();
      const w: Watcher = {
        pattern,
        disposed: false,
        change,
        create,
        onDidChange: change.event,
        onDidCreate: create.event,
        dispose: () => {
          w.disposed = true;
        },
      };
      log.watchers.push(w);
      return w;
    },
  },
  window: {
    registerCustomEditorProvider: (
      viewType: string,
      provider: Provider,
      options: { supportsMultipleEditorsPerDocument?: boolean },
    ) => {
      log.provider = provider;
      log.providerOptions = options;
      log.viewType = viewType;
      return { dispose() {} };
    },
    showOpenDialog: async () => nextOpenDialog,
    setStatusBarMessage: (m: string) => {
      log.status.push(m);
      return { dispose() {} };
    },
    showErrorMessage: (m: string) => {
      log.errors.push(m);
      return Promise.resolve();
    },
    createWebviewPanel: (
      _type: string,
      title: string,
      _col: number,
      options: WebviewOptions,
    ) => {
      const p = makePanel();
      p.title = title;
      p.options = options;
      log.panels.push(p);
      return p;
    },
  },
};
function makePanel(): Panel {
  const recv = new EventEmitter<unknown>();
  const dispose = new EventEmitter();
  const p: Panel = {
    visible: true,
    sent: [],
    webview: {
      options: undefined,
      html: "",
      cspSource: "vscode-webview://test",
      asWebviewUri: (u) => ({
        toString: () => `vscode-webview://test${u.fsPath}`,
      }),
      postMessage: (m) => {
        p.sent.push(m);
        return Promise.resolve(true);
      },
      onDidReceiveMessage: recv.event,
    },
    onDidDispose: dispose.event,
    receive: (m) => recv.fire(m),
    close: () => dispose.fire(),
    recvListeners: () => recv.l.size,
  };
  return p;
}
const load = Module._load;
Module._load = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "vscode" ? vscode : load.call(this, request, ...rest);
};

// The files are named from the repository root, whatever folder this started in.
process.chdir(path.join(__dirname, ".."));
const ext = require(path.resolve("out/extension.cjs")) as {
  activate(context: { extensionUri: FakeUri; subscriptions: unknown[] }): void;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let passed = 0,
  failed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        passed++;
        console.log(`PASS  ${name}`);
      },
      (e: unknown) => {
        failed++;
        console.log(
          `FAIL  ${name}\n      ${(e as Error | undefined)?.message}`,
        );
      },
    );
}

/** The command registered under `id`; one that is not there is a failure. */
function command(id: string): (argument?: unknown) => unknown {
  const fn = log.commands.get(id);
  assert(fn, `${id} is not registered`);
  return fn;
}

/** The custom editor provider the extension registered. */
function provider(): Provider {
  assert(log.provider, "no custom editor provider was registered");
  return log.provider;
}

/** The match of `pattern` in `text`; no match is a failure. */
function match(pattern: RegExp, text: string): RegExpExecArray {
  const found = pattern.exec(text);
  assert(found, `${pattern} does not match`);
  return found;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arglyph-host-"));
  const file = path.join(dir, "Test.ttf");
  fs.writeFileSync(file, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
  const uri = Uri.file(file);
  const ctx = {
    extensionUri: Uri.file("/ext"),
    subscriptions: [] as unknown[],
  };
  ext.activate(ctx);

  await check(
    "activate registers the command and the custom editor (one document per file, several editors)",
    () => {
      assert(log.commands.has("arglyph.open"));
      assert.strictEqual(log.viewType, "wangwenho.arglyph");
      assert.strictEqual(
        log.providerOptions?.supportsMultipleEditorsPerDocument,
        true,
      );
      assert.strictEqual(ctx.subscriptions.length, 4);
    },
  );

  const document = await provider().openCustomDocument(uri);
  await check("openCustomDocument reads the file and watches it once", () => {
    assert.strictEqual(document.name, "Test.ttf");
    assert.deepStrictEqual([...document.bytes], [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.strictEqual(log.watchers.length, 1);
    // The whole folder is watched (a font name can contain glob characters);
    // only events for this file count.
    assert.strictEqual(log.watchers[0].pattern.pattern, "*");
    assert.strictEqual(log.watchers[0].pattern.base.fsPath, dir);
  });

  const a = makePanel(),
    b = makePanel();
  provider().resolveCustomEditor(document, a);
  provider().resolveCustomEditor(document, b);
  await check(
    "two editors on one file share the document: still one watcher",
    () => {
      assert.strictEqual(log.watchers.length, 1);
    },
  );
  await check(
    "the panel gets options (scripts on, only out/webview readable) and a page with a CSP and a nonce",
    () => {
      assert.strictEqual(a.webview.options?.enableScripts, true);
      assert.deepStrictEqual(
        a.webview.options?.localResourceRoots.map((u) => u.fsPath),
        [path.join("/ext", "out", "webview")],
      );
      const csp = match(
        /Content-Security-Policy" content="([^"]+)"/,
        a.webview.html,
      )[1];
      const nonce = match(/nonce-([^']+)'/, csp)[1];
      assert(a.webview.html.includes(`<script nonce="${nonce}"`));
      assert(!csp.includes("unsafe"));
      const other = match(
        /nonce-([^']+)'/,
        match(/Content-Security-Policy" content="([^"]+)"/, b.webview.html)[1],
      )[1];
      assert.notStrictEqual(nonce, other, "each panel has its own nonce");
    },
  );

  await check(
    "nothing is sent before the webview says ready; ready gets the font as an ArrayBuffer",
    () => {
      assert.strictEqual(a.sent.length, 0);
      a.receive({ type: "ready" });
      assert.strictEqual(a.sent.length, 1);
      const m = a.sent[0];
      assert.strictEqual(m.type, "font");
      assert.strictEqual(m.name, "Test.ttf");
      assert(m.data instanceof ArrayBuffer && m.data.byteLength === 8);
      assert.strictEqual("reload" in m, false);
    },
  );

  // The file changes on disk.
  fs.writeFileSync(file, Buffer.from([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]));
  b.receive({ type: "ready" });
  b.sent.length = 0;
  a.sent.length = 0;
  b.visible = false; // b is hidden
  log.watchers[0].change.fire(uri);
  log.watchers[0].change.fire(uri);
  log.watchers[0].create.fire(uri);
  await sleep(700);
  await check(
    "a change on disk: the visible editor is told once, with reload; the hidden one is not",
    () => {
      assert.strictEqual(a.sent.length, 1);
      assert.strictEqual(a.sent[0].reload, true);
      assert.strictEqual(a.sent[0].data.byteLength, 10);
      assert.strictEqual(b.sent.length, 0);
      assert.strictEqual(document.bytes.length, 10);
    },
  );
  await check(
    "the hidden editor gets the new bytes, without reload, when it asks again",
    () => {
      b.receive({ type: "ready" });
      assert.strictEqual(b.sent.length, 1);
      assert.strictEqual(b.sent[0].data.byteLength, 10);
      assert.strictEqual("reload" in b.sent[0], false);
    },
  );

  a.sent.length = 0;
  const now = new Date();
  fs.utimesSync(file, now, new Date(now.getTime() + 5000)); // a touch: same content
  log.watchers[0].change.fire(uri);
  await sleep(500);
  fs.writeFileSync(file, Buffer.alloc(0));
  log.watchers[0].change.fire(uri);
  await sleep(500);
  await check(
    "a touch and an empty file (a tool truncating before it writes) tell nobody",
    () => {
      assert.strictEqual(a.sent.length, 0);
      assert.strictEqual(document.bytes.length, 10);
    },
  );
  fs.rmSync(file);
  log.watchers[0].change.fire(uri);
  await sleep(500);
  fs.writeFileSync(file, Buffer.from([5, 5]));
  log.watchers[0].create.fire(uri);
  await sleep(500);
  await check(
    "a file that vanishes for a moment and comes back (an atomic replace) is picked up",
    () => {
      assert.strictEqual(a.sent.length, 1);
      assert.strictEqual(a.sent[0].data.byteLength, 2);
    },
  );

  await check(
    "copy goes to the clipboard; an empty, oversized or unknown message is ignored",
    () => {
      a.receive({ type: "copy", text: "U+4E00" });
      a.receive({ type: "copy", text: "" });
      a.receive({ type: "copy", text: "x".repeat(65) });
      a.receive({ type: "nonsense" });
      a.receive(null);
      a.receive("copy");
      assert.deepStrictEqual(log.clipboard, ["U+4E00"]);
    },
  );
  await check(
    "the glyph menu: its commands copy what the webview described, and ignore anything else",
    async () => {
      const menu = {
        webview: "x",
        webviewSection: "arglyph.glyph",
        codePoint: "U+4E00",
        character: "一",
      };
      log.clipboard.length = 0;
      await command("arglyph.copyCodePoint")(menu);
      await command("arglyph.copyCharacter")(menu);
      // From the Command Palette there is no argument; a stranger's is not ours.
      await command("arglyph.copyCodePoint")(undefined);
      await command("arglyph.copyCharacter")({ codePoint: "U+0041" });
      assert.deepStrictEqual(log.clipboard, ["U+4E00", "一"]);
      assert.deepStrictEqual(log.status, [
        "Arglyph: copied U+4E00",
        "Arglyph: copied 一",
      ]);
      log.clipboard.length = 0;
    },
  );
  await check("an error from the webview becomes an error message", () => {
    a.receive({ type: "error", name: "Bad.ttf", message: "bad table" });
    assert.deepStrictEqual(log.errors, [
      "Arglyph: could not read Bad.ttf: bad table",
    ]);
  });

  await check(
    "closing an editor stops listening to it; the document lives while another editor is open",
    () => {
      assert.strictEqual(a.recvListeners(), 1);
      a.close();
      assert.strictEqual(a.recvListeners(), 0);
      assert.strictEqual(b.recvListeners(), 1);
      assert.strictEqual(log.watchers[0].disposed, false);
    },
  );
  await check(
    "when VS Code disposes the document the watcher is released",
    () => {
      document.dispose();
      assert.strictEqual(log.watchers[0].disposed, true);
    },
  );

  // The command: a panel of its own, which owns its document.
  const before = log.watchers.length;
  nextOpenDialog = [uri];
  await command("arglyph.open")();
  await check(
    "Open Font...: a panel with the font, its own watcher, released when the panel closes",
    () => {
      assert.strictEqual(log.panels.length, 1);
      const panel = log.panels[0];
      assert.strictEqual(panel.title, "Test.ttf");
      assert.strictEqual(log.watchers.length, before + 1);
      panel.receive({ type: "ready" });
      assert.strictEqual(panel.sent[0].data.byteLength, 2);
      panel.close();
      assert.strictEqual(log.watchers.at(-1)?.disposed, true);
    },
  );
  nextOpenDialog = [Uri.file(path.join(dir, "missing.ttf"))];
  await command("arglyph.open")();
  await check(
    "Open Font... on a file that cannot be read: an error message, no panel",
    () => {
      assert(
        (log.errors.at(-1) ?? "").startsWith("Arglyph: could not open font:"),
        log.errors.at(-1),
      );
      assert.strictEqual(log.panels.length, 1);
    },
  );
  nextOpenDialog = undefined;
  await command("arglyph.open")();
  await check("Open Font... cancelled: nothing happens", () => {
    assert.strictEqual(log.panels.length, 1);
  });

  try {
    await provider().openCustomDocument(Uri.file(path.join(dir, "nope.ttf")));
    assert.fail("should reject");
  } catch (e) {
    await check(
      "openCustomDocument on a missing file rejects (VS Code shows its own error)",
      () => {
        assert(
          (e as NodeJS.ErrnoException).code === "ENOENT" ||
            /ENOENT/.test(String(e)),
        );
      },
    );
  }

  fs.rmSync(dir, { recursive: true });
  console.log(
    `\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} passed)`,
  );
  process.exit(failed === 0 ? 0 : 1);
})();
