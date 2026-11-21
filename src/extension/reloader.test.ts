import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReloader, RELOAD_DELAY_MS, RETRY_LIMIT } from "./reloader.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);

/** A file whose content and timestamps the test controls. */
function fakeFile(initial: Uint8Array) {
  const file = {
    content: initial,
    mtime: 1,
    reads: 0,
    failRead: false,
    /** How long a read takes, in fake milliseconds. */
    readDelay: 0,
    /** Runs between the first stat and the read: the file changes under the reader. */
    duringRead: undefined as undefined | (() => void),
    source: {
      async stat() {
        return { mtime: file.mtime, size: file.content.length };
      },
      async read() {
        file.reads++;
        file.duringRead?.();
        if (file.readDelay > 0) {
          await new Promise((done) => setTimeout(done, file.readDelay));
        }
        if (file.failRead) throw new Error("gone");
        return file.content;
      },
    },
  };
  return file;
}

function setup(initial = bytes(1, 2, 3)) {
  const file = fakeFile(initial);
  let shown: Uint8Array = initial;
  const changes: Uint8Array[] = [];
  const readable: boolean[] = [];
  const reloader = createReloader({
    source: file.source,
    current: () => shown,
    onChange: (next) => {
      shown = next;
      changes.push(next);
    },
    onReadable: (ok) => readable.push(ok),
  });
  return { file, changes, readable, reloader };
}

const settle = () => vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createReloader", () => {
  it("reads once after a burst of events, when the file has been quiet", async () => {
    const { file, changes, reloader } = setup();
    file.content = bytes(9, 9);
    file.mtime = 2;
    for (let i = 0; i < 5; i++) {
      reloader.notify();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(file.reads).toBe(0); // still being hit by events
    await settle();
    expect(file.reads).toBe(1);
    expect(changes).toEqual([bytes(9, 9)]);
  });

  it("ignores a touch: same content", async () => {
    const { file, changes, reloader } = setup(bytes(1, 2, 3));
    file.mtime = 2;
    reloader.notify();
    await settle();
    expect(file.reads).toBe(1);
    expect(changes).toEqual([]);
  });

  it("ignores an empty file (a tool that truncates before it writes)", async () => {
    const { file, changes, reloader } = setup();
    file.content = bytes();
    reloader.notify();
    await settle();
    expect(changes).toEqual([]);
  });

  it("works again at the next event after a read error", async () => {
    const { file, changes, reloader } = setup();
    file.failRead = true;
    reloader.notify();
    await settle();
    expect(changes).toEqual([]);
    file.failRead = false;
    file.content = bytes(7);
    reloader.notify();
    await settle();
    expect(changes).toEqual([bytes(7)]);
  });

  it("tries a failed read again, later each time, and says so once when it stays unreadable", async () => {
    const { file, readable, reloader } = setup();
    file.failRead = true;
    reloader.notify();
    await settle(); // the first try
    expect(file.reads).toBe(1);
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS); // 1 x the delay later
    expect(file.reads).toBe(2);
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS * 2); // then 2 x
    expect(file.reads).toBe(3);
    expect(readable).toEqual([]); // still trying
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS * 4); // then 4 x: the last
    expect(file.reads).toBe(RETRY_LIMIT + 1);
    expect(readable).toEqual([false]);
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS * 20);
    expect(file.reads).toBe(RETRY_LIMIT + 1); // it gave up until the next event
    expect(readable).toEqual([false]); // and did not say it twice
  });

  it("picks the change up when a read works on a later try", async () => {
    const { file, changes, readable, reloader } = setup();
    file.failRead = true;
    file.content = bytes(6, 6);
    file.mtime = 2;
    reloader.notify();
    await settle();
    file.failRead = false; // the replacement is in place by the next try
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS);
    expect(changes).toEqual([bytes(6, 6)]);
    expect(readable).toEqual([]); // it was never said to be unreadable
  });

  it("says the file can be read again, also when it is the content being shown", async () => {
    const { file, changes, readable, reloader } = setup(bytes(1, 2, 3));
    file.failRead = true;
    reloader.notify();
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS * 8);
    expect(readable).toEqual([false]);
    file.failRead = false; // put back exactly as it was
    reloader.notify();
    await settle();
    expect(readable).toEqual([false, true]);
    expect(changes).toEqual([]); // nothing new to show
  });

  it("counts the tries again at a new event", async () => {
    const { file, readable, reloader } = setup();
    file.failRead = true;
    reloader.notify();
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS * 8);
    expect(readable).toEqual([false]);
    const reads = file.reads;
    reloader.notify();
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS * 8);
    expect(file.reads).toBe(reads + RETRY_LIMIT + 1);
    expect(readable).toEqual([false]); // still the same news
  });

  it("waits and tries again when the file changed while it was read", async () => {
    const { file, changes, reloader } = setup();
    file.content = bytes(4, 4);
    let first = true;
    file.duringRead = () => {
      if (first) {
        first = false;
        file.mtime = 5; // someone is still writing
      }
    };
    reloader.notify();
    await settle();
    expect(file.reads).toBe(1);
    expect(changes).toEqual([]); // not trusted yet
    await settle();
    expect(file.reads).toBe(2);
    expect(changes).toEqual([bytes(4, 4)]);
  });

  it("reads again afterwards when the delay runs out in the middle of a read", async () => {
    const { file, changes, reloader } = setup();
    file.readDelay = 500; // longer than the delay between event and read
    file.content = bytes(5);
    reloader.notify();
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS); // the first read starts
    reloader.notify(); // another event; its timer runs out during that read
    await vi.advanceTimersByTimeAsync(2000);
    expect(changes).toEqual([bytes(5)]); // the same content is not reported twice
    expect(file.reads).toBe(2); // but it was looked at once more
  });

  it("does nothing after it is disposed, even for a pending event", async () => {
    const { file, changes, reloader } = setup();
    file.content = bytes(8);
    reloader.notify();
    reloader.dispose();
    await settle();
    expect(file.reads).toBe(0);
    expect(changes).toEqual([]);
  });
});
