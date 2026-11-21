// A drag with the pointer on one element, the way a thumb or a sash needs it:
// the element captures the pointer (so the drag goes on outside it), `move` is
// told about every move, `end` once when the pointer is let go or the drag is
// cancelled, and the listeners are removed again.

export interface PointerDrag {
  move(event: PointerEvent): void;
  end(event: PointerEvent): void;
}

export function trackPointerDrag(
  element: HTMLElement,
  start: PointerEvent,
  { move, end }: PointerDrag,
): void {
  element.setPointerCapture(start.pointerId);
  const finish = (event: PointerEvent) => {
    element.releasePointerCapture(event.pointerId);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", finish);
    element.removeEventListener("pointercancel", finish);
    end(event);
  };
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", finish);
  element.addEventListener("pointercancel", finish);
}
