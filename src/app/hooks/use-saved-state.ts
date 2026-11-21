import { useCallback, useRef, useState } from "react";
import type { SavedUi } from "../lib/saved-ui.ts";

/**
 * A piece of state that is also reported to the page, to be kept: it starts from
 * what was saved (or `fallback`), and every change is handed to `onSavedChange`.
 * `set` takes a value or a function of the current one; the current one is the
 * latest even when two changes come before a render.
 */
export function useSavedState<K extends keyof SavedUi>(
  key: K,
  fallback: NonNullable<SavedUi[K]>,
  saved: SavedUi | undefined,
  onSavedChange: ((patch: SavedUi) => void) | undefined,
) {
  type Value = NonNullable<SavedUi[K]>;
  const [value, setValue] = useState<Value>(
    (saved?.[key] ?? fallback) as Value,
  );
  const latest = useRef(value);
  const set = useCallback(
    (next: Value | ((current: Value) => Value)) => {
      const resolved =
        typeof next === "function"
          ? (next as (current: Value) => Value)(latest.current)
          : next;
      latest.current = resolved;
      setValue(resolved);
      onSavedChange?.({ [key]: resolved } as SavedUi);
    },
    [key, onSavedChange],
  );
  return [value, set] as const;
}
