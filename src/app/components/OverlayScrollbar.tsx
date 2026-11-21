import { type RefObject, useEffect, useRef } from "react";
import { trackPointerDrag } from "../lib/pointer-drag.ts";
import { scrollFor, thumbFor } from "../lib/scrollbar-math.ts";

export interface OverlayScrollbarProps {
  /** The element that scrolls. It must not show a scrollbar of its own (`overlay-scroll`). */
  target: RefObject<HTMLElement | null>;
}

const HIDE_AFTER_MS = 1000;

type Axis = "vertical" | "horizontal";

// A scrollbar drawn over its content, like VS Code's: it takes no room, so the
// content can reach the edge and does not move when a scrollbar comes or goes. It
// shows while the content scrolls (or the pointer is on it) and fades after a
// moment. It is drawn next to the scrolling element, inside the same positioned
// parent, and follows it: scroll, size and content changes move the thumb.
// Dragging the thumb or clicking the track scrolls.
export function OverlayScrollbar({ target }: OverlayScrollbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = target.current;
    const root = rootRef.current;
    if (!element || !root) return;
    const scroller: HTMLElement = element;
    const frame: HTMLDivElement = root;

    const parts = {
      vertical: {
        track: frame.querySelector<HTMLElement>('[data-axis="vertical"]'),
        thumb: frame.querySelector<HTMLElement>(
          '[data-axis="vertical"] > .overlay-thumb',
        ),
      },
      horizontal: {
        track: frame.querySelector<HTMLElement>('[data-axis="horizontal"]'),
        thumb: frame.querySelector<HTMLElement>(
          '[data-axis="horizontal"] > .overlay-thumb',
        ),
      },
    };
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let dragging = false;

    // Content that grows from the right (vertical text) scrolls through negative
    // positions: its start is at the right.
    function fromRight() {
      const style = getComputedStyle(scroller);
      return style.direction === "rtl" || style.writingMode === "vertical-rl";
    }

    function measure(axis: Axis) {
      const vertical = axis === "vertical";
      const view = vertical ? scroller.clientHeight : scroller.clientWidth;
      const content = vertical ? scroller.scrollHeight : scroller.scrollWidth;
      const range = content - view;
      const raw = vertical ? scroller.scrollTop : scroller.scrollLeft;
      const reversed = !vertical && fromRight();
      return {
        view,
        content,
        range,
        scroll: reversed ? range + raw : raw,
        reversed,
      };
    }

    function update() {
      let horizontalShown = false;
      for (const axis of ["horizontal", "vertical"] as const) {
        const { track, thumb } = parts[axis];
        if (!track || !thumb) continue;
        const m = measure(axis);
        const vertical = axis === "vertical";
        // The two tracks leave the corner between them alone.
        const length =
          (vertical ? scroller.clientHeight : scroller.clientWidth) -
          (vertical && horizontalShown ? 12 : 0);
        const result = thumbFor(m.view, m.content, m.scroll, length);
        track.hidden = result === null;
        if (!result) continue;
        if (!vertical) horizontalShown = true;
        if (vertical) track.style.bottom = horizontalShown ? "12px" : "0";
        if (vertical) {
          thumb.style.height = `${result.size}px`;
          thumb.style.transform = `translateY(${result.offset}px)`;
        } else {
          thumb.style.width = `${result.size}px`;
          thumb.style.transform = `translateX(${result.offset}px)`;
        }
      }
    }

    function reveal() {
      frame.dataset.visible = "true";
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!dragging) frame.dataset.visible = "false";
      }, HIDE_AFTER_MS);
    }

    function onScroll() {
      update();
      reveal();
    }

    // Where the content ends changes without the element changing size: watch
    // its children too, and the list of them.
    const resize = new ResizeObserver(update);
    function watchChildren() {
      resize.disconnect();
      resize.observe(scroller);
      for (const child of scroller.children) resize.observe(child);
    }
    watchChildren();
    const mutation = new MutationObserver(() => {
      watchChildren();
      update();
    });
    mutation.observe(scroller, { childList: true });
    scroller.addEventListener("scroll", onScroll, { passive: true });
    update();

    // Grab a thumb, or press the track to go there.
    function onPointerDown(event: PointerEvent) {
      const trackElement = (event.target as HTMLElement).closest<HTMLElement>(
        ".overlay-track",
      );
      if (!trackElement || event.button !== 0) return;
      const axis = trackElement.dataset.axis as Axis;
      const vertical = axis === "vertical";
      const thumb = parts[axis].thumb;
      if (!thumb) return;
      event.preventDefault();
      const trackBox = trackElement.getBoundingClientRect();
      const length = vertical ? trackBox.height : trackBox.width;
      const point = (e: PointerEvent) =>
        vertical ? e.clientY - trackBox.top : e.clientX - trackBox.left;
      const thumbBox = thumb.getBoundingClientRect();
      const thumbSize = vertical ? thumbBox.height : thumbBox.width;
      const thumbStart = vertical
        ? thumbBox.top - trackBox.top
        : thumbBox.left - trackBox.left;
      const onThumb = event.target === thumb;
      // Where in the thumb it was taken: it stays under the pointer.
      const grab = onThumb ? point(event) - thumbStart : thumbSize / 2;

      const goTo = (e: PointerEvent) => {
        const m = measure(axis);
        const logical = scrollFor(
          point(e) - grab,
          m.view,
          m.content,
          length,
          thumbSize,
        );
        const position = m.reversed ? logical - m.range : logical;
        scroller.scrollTo(
          vertical
            ? { top: position, behavior: "instant" }
            : { left: position, behavior: "instant" },
        );
      };
      dragging = true;
      frame.dataset.dragging = "true";
      if (!onThumb) goTo(event);
      trackPointerDrag(trackElement, event, {
        move: goTo,
        end() {
          dragging = false;
          delete frame.dataset.dragging;
          reveal();
        },
      });
    }
    frame.addEventListener("pointerdown", onPointerDown);

    return () => {
      clearTimeout(hideTimer);
      resize.disconnect();
      mutation.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      frame.removeEventListener("pointerdown", onPointerDown);
    };
  }, [target]);

  return (
    <div className="overlay-scrollbar" ref={rootRef} data-visible="false">
      <div className="overlay-track" data-axis="vertical" hidden>
        <div className="overlay-thumb" />
      </div>
      <div className="overlay-track" data-axis="horizontal" hidden>
        <div className="overlay-thumb" />
      </div>
    </div>
  );
}
