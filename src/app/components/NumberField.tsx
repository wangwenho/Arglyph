import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { keepFocus } from "../lib/keep-focus.ts";

export interface NumberFieldProps {
  /** The id its label points at (see Field). */
  id?: string;
  /** null: nothing in the box (only when `auto` says what that means). */
  value: number | null;
  min: number;
  max: number;
  step: number;
  /** What an empty box means ("Auto"); without it the box always has a number. */
  auto?: string;
  /** What the number counts, after the box ("×", "%", "px"). */
  unit?: string;
  label: string;
  title?: string;
  /** The box only shows the value: the buttons are the only way to change it. */
  readOnly?: boolean;
  /** A number inside [min, max] was typed, or null for an empty box. */
  onChange?(value: number | null): void;
  /** − or + was pressed (or held): one step in that direction. */
  onStep(direction: -1 | 1): void;
  /** Whether a step in that direction is possible; both are when not given. */
  canStep?(direction: -1 | 1): boolean;
  /** Enter was pressed: the user is done and wants to go back to what they were doing. */
  onCommit?(): void;
}

const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 70;

// One of the two buttons. A press steps once; holding it keeps stepping, the
// way a slider would be dragged. The keyboard's Enter and Space click it once.
function StepButton({
  direction,
  label,
  disabled,
  onStep,
}: {
  direction: -1 | 1;
  label: string;
  disabled: boolean;
  onStep(direction: -1 | 1): void;
}) {
  // The newest callback: a held button must step from the value it has now.
  const step = useEffectEvent(() => onStep(direction));
  const timers = useRef<{
    delay?: ReturnType<typeof setTimeout>;
    repeat?: ReturnType<typeof setInterval>;
  }>({});

  const stop = useCallback(() => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
  }, []);
  useEffect(() => stop, [stop]);
  // At the end of the range there is nothing more to hold on to.
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  return (
    <button
      type="button"
      className="step-button"
      aria-label={label}
      data-tip={label}
      disabled={disabled}
      // The focus stays where it was (the text, usually).
      onMouseDown={keepFocus}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        stop();
        step();
        timers.current.delay = setTimeout(() => {
          timers.current.repeat = setInterval(step, REPEAT_MS);
        }, REPEAT_DELAY_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(event) => {
        // A pointer click was handled when the button went down.
        if (event.detail === 0) onStep(direction);
      }}
    >
      {/* Drawn, not typeset: a font's minus and plus sit low in their line. */}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d={direction < 0 ? "M1.5 5h7" : "M1.5 5h7M5 1.5v7"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

// A small number control for the toolbar: [ − 35 + ] px. The number can be typed,
// or the buttons used (the same two as the zoom view has, but stepping by a fixed
// amount). While the box has the focus it shows what the user typed, whatever it
// is; only a number inside the range is passed on, so typing "48" does not stop
// at "4" (below the minimum) on the way. When the focus leaves, the box shows the
// value that was kept.
export function NumberField({
  id,
  value,
  min,
  max,
  step,
  auto,
  unit,
  label,
  title,
  readOnly,
  onChange,
  onStep,
  canStep,
  onCommit,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function change(text: string) {
    setDraft(text);
    if (text.trim() === "") {
      if (auto !== undefined) onChange?.(null);
      return;
    }
    const number = Number(text);
    if (Number.isFinite(number) && number >= min && number <= max) {
      onChange?.(number);
    }
  }

  // What was typed is out of date as soon as a button changes the value.
  function stepBy(direction: -1 | 1) {
    setDraft(null);
    onStep(direction);
  }

  return (
    <span className="number-field">
      <fieldset className="number-group" aria-label={label}>
        <StepButton
          direction={-1}
          label={`Decrease ${label.toLowerCase()}`}
          disabled={canStep ? !canStep(-1) : false}
          onStep={stepBy}
        />
        <input
          id={id}
          type="number"
          className="toolbar-number"
          value={draft ?? (value === null ? "" : String(value))}
          placeholder={auto}
          min={min}
          max={max}
          step={step}
          readOnly={readOnly}
          aria-label={label}
          data-tip={title ?? label}
          onChange={(event) => change(event.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== "Escape") return;
            event.currentTarget.blur();
            onCommit?.();
          }}
        />
        <StepButton
          direction={1}
          label={`Increase ${label.toLowerCase()}`}
          disabled={canStep ? !canStep(1) : false}
          onStep={stepBy}
        />
      </fieldset>
      {unit && (
        <span className="number-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </span>
  );
}
