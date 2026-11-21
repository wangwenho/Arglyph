import { type RefObject, useEffect, useEffectEvent, useState } from "react";
import { characterAtPoint } from "../lib/text-hit.ts";

/**
 * The character the pointer is over while Cmd (Ctrl) is held, where it starts
 * in the text: the one a Cmd/Ctrl+click would look closer at. null when the key
 * is not held, or the pointer is not over a character. This is what lets the
 * text show, like a link in an editor, that the character can be clicked.
 *
 * The question is asked at most once a frame, and only while the key is held:
 * finding the character under the pointer is not free.
 */
export function useLinkHover(
  mirror: RefObject<HTMLElement | null>,
  box: RefObject<HTMLElement | null>,
  /** The length of the text, in UTF-16 units. */
  length: number,
  /** False while something else has the pointer or the text is being edited. */
  enabled: boolean,
): number | null {
  const [hover, setHover] = useState<number | null>(null);
  const currentLength = useEffectEvent(() => length);

  // The text changed: where the character was means nothing now.
  const [seenLength, setSeenLength] = useState(length);
  if (seenLength !== length) {
    setSeenLength(length);
    setHover(null);
  }

  useEffect(() => {
    const boxElement = box.current;
    if (!boxElement || !enabled) {
      setHover(null);
      return;
    }
    let at: { x: number; y: number } | null = null;
    let held = false;
    let frame = 0;

    function refresh() {
      frame = 0;
      const mirrorElement = mirror.current;
      if (!boxElement || !held || !at || !mirrorElement) {
        setHover(null);
        return;
      }
      setHover(
        characterAtPoint(
          mirrorElement,
          boxElement,
          at.x,
          at.y,
          currentLength(),
        ),
      );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(refresh);
    }
    function onMove(event: PointerEvent) {
      at = { x: event.clientX, y: event.clientY };
      held = event.metaKey || event.ctrlKey;
      schedule();
    }
    function onLeave() {
      at = null;
      schedule();
    }
    // Pressing or letting go of the key with the pointer still.
    function onKey(event: KeyboardEvent) {
      const next = event.metaKey || event.ctrlKey;
      if (next === held) return;
      held = next;
      schedule();
    }
    function onBlur() {
      held = false;
      schedule();
    }

    boxElement.addEventListener("pointermove", onMove);
    boxElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      boxElement.removeEventListener("pointermove", onMove);
      boxElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      cancelAnimationFrame(frame);
    };
  }, [enabled, mirror, box]);

  return hover;
}
