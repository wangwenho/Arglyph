// Reading a file again when it changed on disk, without reading it half
// written.
//
// Font tools often write a file in several steps (truncate, then write), and an
// editor's "save" can fire several events. So:
//  - events are debounced: the file is read once things have been quiet;
//  - a read only counts when the file did not change while it was read (same
//    size and modification time before and after, and the size matches what was
//    read); otherwise it is probably still being written, so wait and retry;
//  - identical content (a touch, a save without changes) is ignored;
//  - an empty file is ignored;
//  - a read error is tried again a few times, each a little later than the one
//    before (the file is gone for a moment while it is replaced, and an event
//    can be missed, on a network drive or in WSL). If it stays unreadable, that
//    is said once (`onReadable(false)`), and again when it can be read (`true`).
//
// This has no dependency on `vscode`: the file and the events come in through
// the arguments, so the logic can be tested with a fake file and fake timers.

/** How long the file must stay quiet before it is read again. */
export const RELOAD_DELAY_MS = 300;

/** How many times a failed read is tried again before the file counts as unreadable. */
export const RETRY_LIMIT = 3;

export interface FileSource {
  stat(): Promise<{ mtime: number; size: number }>;
  read(): Promise<Uint8Array>;
}

export interface Reloader {
  /** The file may have changed: something fired an event for it. */
  notify(): void;
  dispose(): void;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && Buffer.compare(a, b) === 0;
}

export function createReloader(options: {
  source: FileSource;
  /** The content that is being shown now. */
  current(): Uint8Array;
  /** The file really changed, and this is its new content. */
  onChange(bytes: Uint8Array): void;
  /**
   * Whether the file can be read, only when that changes: false after the last
   * try failed, true again at the next read that worked (also when the content
   * is the one being shown, as when a file is put back as it was).
   */
  onReadable?(readable: boolean): void;
  delayMs?: number;
}): Reloader {
  const {
    source,
    current,
    onChange,
    onReadable,
    delayMs = RELOAD_DELAY_MS,
  } = options;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  let disposed = false;
  let failures = 0;
  let unreadable = false;

  function schedule(wait = delayMs) {
    clearTimeout(timer);
    timer = setTimeout(reload, wait);
  }

  async function reload() {
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const before = await source.stat();
      const bytes = await source.read();
      const after = await source.stat();
      if (
        before.mtime !== after.mtime ||
        before.size !== after.size ||
        bytes.length !== after.size
      ) {
        schedule();
      } else if (!disposed && bytes.length > 0) {
        failures = 0;
        if (unreadable) {
          unreadable = false;
          onReadable?.(true);
        }
        if (!equalBytes(bytes, current())) onChange(bytes);
      }
    } catch {
      if (!disposed) {
        failures++;
        if (failures <= RETRY_LIMIT) {
          // 300, 600, 1200 ms with the default delay.
          schedule(delayMs * 2 ** (failures - 1));
        } else if (!unreadable) {
          unreadable = true;
          onReadable?.(false);
        }
      }
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  return {
    notify() {
      // A new event is a new start: the tries are counted again.
      failures = 0;
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
