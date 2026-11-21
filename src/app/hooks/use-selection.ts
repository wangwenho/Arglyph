import { useCallback, useState } from "react";
import type { GridModel } from "../../core/grid/model.ts";

/**
 * Which item of `model` is selected, and how the grid reports a new selection.
 *
 * The selection remembers the model it was made in: an index into the old
 * font's model means nothing in the new one, and the render with the new model
 * happens before the grid view has had the chance to reset itself. So an index
 * counts only for the model it belongs to; for any other it is -1. This is
 * derived while rendering, not corrected afterwards in an effect.
 *
 * `settled` says whether the selection belongs to `model`. For a new model it
 * is false until the grid view has reported what it selected there, which tells
 * "nothing is selected" from "not known yet".
 */
export function useSelection(
  model: GridModel | null,
): [
  selectedIndex: number,
  onSelect: (index: number) => void,
  settled: boolean,
] {
  const [selection, setSelection] = useState<{
    model: GridModel | null;
    index: number;
  }>({ model: null, index: -1 });
  const onSelect = useCallback(
    (index: number) => setSelection({ model, index }),
    [model],
  );
  const settled = selection.model === model;
  return [settled ? selection.index : -1, onSelect, settled];
}
