/**
 * Call `onChange` whenever the device pixel ratio changes (the window moved to
 * another screen, or the page was zoomed). ResizeObserver does not always
 * notice. The media query value is fixed, so it is armed again with the new
 * ratio after every change. Returns the way to stop.
 */
export function watchDevicePixelRatio(onChange: () => void): () => void {
  let query: MediaQueryList | null = null;
  function changed() {
    onChange();
    watch();
  }
  function watch() {
    query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", changed, { once: true });
  }
  watch();
  return () => query?.removeEventListener("change", changed);
}
