// The timings overlay and the auto-scroll of the dev page, which `pnpm bench`
// reads. Not part of the extension.

interface CacheStats {
  hits: number;
  misses: number;
}

interface PerfStatsOptions {
  viewport: HTMLElement;
  takeCacheStats: () => CacheStats;
}

/**
 * Show render timings in the corner of the page and expose `window.autoScroll`
 * (both used by `pnpm bench`). `stop` removes them again: the overlay must not
 * be installed twice when React mounts the grid twice.
 */
export function installPerfStats({
  viewport,
  takeCacheStats,
}: PerfStatsOptions): { onRender(elapsedMs: number): void; stop(): void } {
  const overlay = document.createElement("div");
  overlay.id = "stats";
  document.body.appendChild(overlay);

  let renderCount = 0;
  let renderTotalMs = 0;
  let renderMaxMs = 0;

  const interval = setInterval(() => {
    const avg = renderCount ? renderTotalMs / renderCount : 0;
    const { hits, misses } = takeCacheStats();
    const lookups = hits + misses;
    const hitRate = lookups ? (hits / lookups) * 100 : 0;
    overlay.textContent = `renders/s: ${renderCount}  avg: ${avg.toFixed(2)} ms  max: ${renderMaxMs.toFixed(2)} ms  cache: ${hitRate.toFixed(0)}%`;
    renderCount = 0;
    renderTotalMs = 0;
    renderMaxMs = 0;
  }, 1000);

  function autoScroll(seconds = 10, pxPerFrame = 300) {
    const end = performance.now() + seconds * 1000;
    let dir = 1;
    function step() {
      const max = viewport.scrollHeight - viewport.clientHeight;
      viewport.scrollTop += dir * pxPerFrame;
      if (viewport.scrollTop >= max) dir = -1;
      if (viewport.scrollTop <= 0) dir = 1;
      if (performance.now() < end) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  (window as unknown as { autoScroll?: typeof autoScroll }).autoScroll =
    autoScroll;

  return {
    onRender(elapsedMs) {
      renderCount++;
      renderTotalMs += elapsedMs;
      if (elapsedMs > renderMaxMs) renderMaxMs = elapsedMs;
    },
    stop() {
      clearInterval(interval);
      overlay.remove();
      (window as unknown as { autoScroll?: unknown }).autoScroll = undefined;
    },
  };
}
