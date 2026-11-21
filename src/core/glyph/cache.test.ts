import { describe, expect, it, vi } from "vitest";
import { GlyphCache } from "./cache.ts";

describe("GlyphCache", () => {
  it("does not rebuild on a hit, and counts hits and misses", () => {
    const build = vi.fn((i: number) => ({ id: i }));
    const cache = new GlyphCache(10, build);

    const first = cache.get(1);
    const second = cache.get(1);

    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
    expect(cache.takeStats()).toEqual({ hits: 1, misses: 1 });
  });

  it("resets the counters after takeStats", () => {
    const cache = new GlyphCache(10, (i) => ({ id: i }));
    cache.get(1);
    cache.takeStats();

    expect(cache.takeStats()).toEqual({ hits: 0, misses: 0 });
  });

  it("evicts the least recently used entry when over the limit (LRU)", () => {
    const build = vi.fn((i: number) => ({ id: i }));
    const cache = new GlyphCache(2, build);

    cache.get(1);
    cache.get(2);
    cache.get(1); // 1 becomes most recently used, 2 the least
    cache.get(3); // over the limit: 2 should be evicted
    build.mockClear();

    cache.get(1);
    cache.get(3);
    expect(build).not.toHaveBeenCalled();

    cache.get(2);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
