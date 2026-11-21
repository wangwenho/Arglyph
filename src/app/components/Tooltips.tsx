import { useEffect, useLayoutEffect, useRef, useState } from "react";

// One tooltip for the whole app, for anything that has a `data-tip`. The
// browser's own `title` is slow (about a second), is not drawn the same
// everywhere, never shows on keyboard focus, and cannot be styled; this one
// comes after a short delay, follows the theme, is kept inside the window, and
// once one has been shown the next comes at once, as in VS Code itself.

const SHOW_DELAY_MS = 350;
/** After one tooltip, the next one is not delayed if it comes within this. */
const WARM_MS = 500;
const EDGE = 8;
const GAP = 6;

interface Shown {
  text: string;
  target: Element;
}

export function Tooltips() {
  const [shown, setShown] = useState<Shown | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warmUntil = 0;
    let current: Element | null = null;

    function hide() {
      clearTimeout(timer);
      current = null;
      setShown((now) => {
        if (now) warmUntil = Date.now() + WARM_MS;
        return null;
      });
    }
    function tipOf(node: EventTarget | null): Element | null {
      return node instanceof Element ? node.closest("[data-tip]") : null;
    }
    function show(target: Element, immediately: boolean) {
      if (target === current) return;
      hide();
      current = target;
      const open = () => {
        const text = target.getAttribute("data-tip");
        if (text && target.isConnected) setShown({ text, target });
      };
      if (immediately || Date.now() < warmUntil) open();
      else timer = setTimeout(open, SHOW_DELAY_MS);
    }

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = tipOf(event.target);
      if (target) show(target, false);
      else hide();
    };
    const onFocus = (event: FocusEvent) => {
      const target = tipOf(event.target);
      // Only for the keyboard: a click focuses too, and the tip would cover it.
      if (target?.matches(":focus-visible")) show(target, true);
    };
    const options = { capture: true };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("focusin", onFocus);
    for (const type of ["pointerdown", "keydown", "wheel", "focusout"]) {
      document.addEventListener(type, hide, options);
    }
    document.addEventListener("scroll", hide, options);
    document.documentElement.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("focusin", onFocus);
      for (const type of ["pointerdown", "keydown", "wheel", "focusout"]) {
        document.removeEventListener(type, hide, options);
      }
      document.removeEventListener("scroll", hide, options);
      document.documentElement.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Under the thing it describes, centred, and kept inside the window; above it
  // when there is no room below.
  useLayoutEffect(() => {
    const element = box.current;
    if (!shown || !element) return;
    const anchor = shown.target.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const left = Math.min(
      Math.max(EDGE, anchor.left + anchor.width / 2 - width / 2),
      Math.max(EDGE, window.innerWidth - width - EDGE),
    );
    const below = anchor.bottom + GAP;
    const top =
      below + height > window.innerHeight - EDGE
        ? Math.max(EDGE, anchor.top - GAP - height)
        : below;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.visibility = "visible";
  }, [shown]);

  if (!shown) return null;
  return (
    <div ref={box} className="tooltip" role="tooltip">
      {shown.text}
    </div>
  );
}
