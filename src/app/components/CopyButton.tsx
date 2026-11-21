import { useEffect, useState } from "react";
import { keepFocus } from "../lib/keep-focus.ts";

type CopyState = "idle" | "copied" | "failed";

const FEEDBACK_MS = 1200;

/** A button that copies `text` and says so for a moment. */
export function CopyButton({
  label,
  text,
  copyText,
}: {
  label: string;
  text: string;
  copyText(text: string): Promise<void>;
}) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      className="button"
      // A mouse click must not take the keyboard focus away from the grid, or
      // the arrow keys would stop moving the selection. Tab still reaches it.
      onMouseDown={keepFocus}
      onClick={() =>
        copyText(text).then(
          () => setState("copied"),
          () => setState("failed"),
        )
      }
    >
      {state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Copy failed"
          : label}
    </button>
  );
}
