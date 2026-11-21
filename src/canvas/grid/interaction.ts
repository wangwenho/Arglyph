// Pointer and keyboard handling for the grid.
//
// Events are attached to the scroll container, not the canvas: the canvas sits
// on top of it with `pointer-events: none` (it only draws), so the container is
// what receives the pointer and holds the keyboard focus.

import {
  type CardLayout,
  computeRevealScrollTop,
  hitTest,
} from "../../core/grid/layout.ts";
import {
  firstVisibleIndex,
  moveSelection,
  type NavDirection,
} from "../../core/grid/navigation.ts";

/** What the interaction needs from the view. The view owns all the state. */
export interface GridInteractionHost {
  viewport: HTMLElement;
  layout(): CardLayout;
  itemCount(): number;
  selectedIndex(): number;
  setHover(index: number): void;
  setSelected(index: number): void;
  /** Open the zoom view on the selected item (Space, double-click). */
  open(): void;
  /**
   * The context menu is about to open over item `index` (-1: over nothing). It
   * is called while the event is handled, so what VS Code reads from the page
   * for the menu can be set right then.
   */
  contextMenu?(index: number): void;
}

function directionOf(key: string): NavDirection | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

/** Start handling the pointer and keys on the grid. Returns the way to stop. */
export function attachGridInteraction(host: GridInteractionHost): () => void {
  const { viewport } = host;
  // The container needs a tabindex to receive key events at all.
  viewport.tabIndex = 0;

  const stops: (() => void)[] = [];
  function listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) {
    viewport.addEventListener(type, handler);
    stops.push(() => viewport.removeEventListener(type, handler));
  }

  let pointerX = 0;
  let pointerY = 0;
  let pointerInside = false;

  // The pointer position in the grid's own coordinates: relative to the
  // content's left edge and to the top of the whole scrolled content.
  function itemAtPointer(): number {
    const rect = viewport.getBoundingClientRect();
    const x = pointerX - rect.left - viewport.clientLeft;
    const y = pointerY - rect.top - viewport.clientTop + viewport.scrollTop;
    return hitTest(x, y, host.layout(), host.itemCount());
  }

  function updateHover() {
    const index = pointerInside ? itemAtPointer() : -1;
    host.setHover(index);
    viewport.style.cursor = index >= 0 ? "pointer" : "";
  }

  listen("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerInside = true;
    updateHover();
  });

  listen("pointerleave", () => {
    pointerInside = false;
    updateHover();
  });

  // Scrolling moves the cards under a still pointer.
  listen("scroll", () => {
    if (pointerInside) updateHover();
  });

  listen("click", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    const index = itemAtPointer();
    if (index >= 0) host.setSelected(index);
  });

  // The first click of a double-click has selected the item already.
  listen("dblclick", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (itemAtPointer() >= 0) host.open();
  });

  // A right click selects what it is on, like a click, so that the menu, the
  // inspector and the highlight all talk about the same glyph. The event is not
  // cancelled: VS Code builds its menu from it.
  //
  // The menu key (and Shift+F10) sends the same event with `button` -1 and the
  // coordinates of the middle of the focused element, which is no glyph the user
  // chose: the menu is then about the selected one.
  listen("contextmenu", (event) => {
    if (event.button === -1) {
      host.contextMenu?.(host.selectedIndex());
      return;
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    const index = itemAtPointer();
    if (index >= 0) host.setSelected(index);
    host.contextMenu?.(index);
  });

  listen("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;

    if (event.key === "Escape") {
      host.setSelected(-1);
      return;
    }
    if (event.key === " ") {
      // Without this the container would scroll a page down.
      event.preventDefault();
      if (host.selectedIndex() >= 0) host.open();
      return;
    }
    const direction = directionOf(event.key);
    if (!direction) return;
    // Without this the container would scroll by itself.
    event.preventDefault();

    const count = host.itemCount();
    if (count === 0) return;
    const layout = host.layout();
    const current = host.selectedIndex();
    const next =
      current < 0
        ? firstVisibleIndex(viewport.scrollTop, layout, count)
        : moveSelection(current, direction, layout.cols, count);
    host.setSelected(next);
    viewport.scrollTop = computeRevealScrollTop(
      next,
      layout,
      viewport.scrollTop,
      viewport.clientHeight,
    );
  });

  return () => {
    for (const stop of stops) stop();
    viewport.style.cursor = "";
  };
}
