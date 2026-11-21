import { stepTargetSize } from "../../core/grid/layout.ts";
import { Field } from "./Field.tsx";
import { NumberField } from "./NumberField.tsx";

export interface GridSizeFieldProps {
  /** The size the cards have now, what the box shows; null before a grid was laid out. */
  size: number | null;
  /** The width the cards are laid out in. */
  width: number;
  /** The size the user asked for. */
  target: number;
  onTargetChange(target: number): void;
  /** Back to the grid, where the keys are for. */
  onCommit(): void;
}

// The size of the glyph cards. The box cannot be typed in: how big a card can be
// depends on the width (a whole number of columns fills it), so the buttons go from
// one column count to the next and the box says what size that came to.
export function GridSizeField({
  size,
  width,
  target,
  onTargetChange,
  onCommit,
}: GridSizeFieldProps) {
  const step = (direction: -1 | 1) => stepTargetSize(width, target, direction);
  return (
    <Field label="Size">
      {(id) => (
        <NumberField
          id={id}
          value={size ?? target}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          unit="px"
          label="Glyph size"
          title="Glyph size. − and + change it by one column. The cards fill the width, so only some sizes fit."
          readOnly
          onStep={(direction) => {
            const next = step(direction);
            if (next !== null) onTargetChange(next);
          }}
          canStep={(direction) => width > 0 && step(direction) !== null}
          onCommit={onCommit}
        />
      )}
    </Field>
  );
}
