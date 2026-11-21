import type { MouseEvent, PointerEvent } from "react";

/**
 * For the `onMouseDown` (or `onPointerDown`) of a button that must not take the
 * keyboard focus: a click on it then leaves the focus where it was (the grid,
 * the text), so the keys keep working. Tab still reaches the button.
 */
export function keepFocus(event: MouseEvent | PointerEvent): void {
  event.preventDefault();
}
