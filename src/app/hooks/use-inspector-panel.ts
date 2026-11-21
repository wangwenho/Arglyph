import { type RefObject, useCallback, useEffect, useState } from "react";
import {
  clampInspectorWidth,
  DEFAULT_INSPECTOR_WIDTH,
} from "../lib/inspector-width.ts";
import type { SavedUi } from "../lib/saved-ui.ts";
import { useElementWidth } from "./use-element-width.ts";
import { useSavedState } from "./use-saved-state.ts";

/** Below this width the inspector starts closed. */
const AUTO_COLLAPSE_WIDTH = 700;

/**
 * The inspector's side of the layout: open or closed, and how wide.
 *
 * Open: until the user touches the toggle, the width of the window decides; after
 * that their choice does (and is kept). Width: a CSS variable on the app's root,
 * so that dragging changes it directly without rendering anything, and only the
 * end of a drag is kept in state.
 */
export function useInspectorPanel({
  root,
  body,
  saved,
  onSavedChange,
  openByDefault,
}: {
  /** The element that holds `--inspector-width`, and whose width decides. */
  root: RefObject<HTMLElement | null>;
  /** The element the inspector lies in: it limits how wide the inspector can be. */
  body: RefObject<HTMLElement | null>;
  saved?: SavedUi;
  onSavedChange?(patch: SavedUi): void;
  /** What to start with when the user never chose; the window's width decides if not given. */
  openByDefault?: boolean;
}) {
  const [width, setWidth] = useSavedState(
    "inspectorWidth",
    DEFAULT_INSPECTOR_WIDTH,
    saved,
    onSavedChange,
  );
  const showWidth = useCallback(
    (value: number) =>
      root.current?.style.setProperty("--inspector-width", `${value}px`),
    [root],
  );
  useEffect(() => showWidth(width), [width, showWidth]);
  const keepWidth = useCallback(
    (value: number) => {
      setWidth(value);
      showWidth(value);
    },
    [setWidth, showWidth],
  );

  const windowWidth = useElementWidth(root);
  // null: the user has not touched the toggle.
  const [chosen, setChosen] = useState<boolean | null>(
    saved?.inspectorOpen ?? openByDefault ?? null,
  );
  const open = chosen ?? windowWidth >= AUTO_COLLAPSE_WIDTH;
  const toggle = useCallback(() => {
    setChosen(!open);
    onSavedChange?.({ inspectorOpen: !open });
  }, [open, onSavedChange]);

  return {
    open,
    toggle,
    width,
    showWidth,
    keepWidth,
    resetWidth: () => keepWidth(DEFAULT_INSPECTOR_WIDTH),
    /** The widest it can be in the room there is now. */
    widest: () =>
      clampInspectorWidth(
        Number.POSITIVE_INFINITY,
        body.current?.clientWidth ?? 0,
      ),
  };
}
