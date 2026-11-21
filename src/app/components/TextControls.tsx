import { clamp } from "../../core/math.ts";
import {
  DEFAULT_TEXT_STYLE,
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MAX_TEXT_SIZE,
  MIN_LETTER_SPACING,
  MIN_LINE_HEIGHT,
  MIN_TEXT_SIZE,
  normalizeLetterSpacing,
  normalizeLineHeight,
  stepTextSize,
  TEXT_SIZE_STEP,
  type TextOrientation,
  type TextStyle,
} from "../../core/text/text.ts";
import { keepFocus } from "../lib/keep-focus.ts";
import { Field } from "./Field.tsx";
import { NumberField } from "./NumberField.tsx";

/** What the − and + of each field add. */
const LINE_STEP = 0.1;
const LETTER_STEP = 1;

export interface TextControlsProps {
  /** The font size, in pixels. */
  size: number;
  onSizeChange(size: number): void;
  style: TextStyle;
  onChange(style: TextStyle): void;
  /** Enter was pressed in a field: the keys go back to the text. */
  onCommit(): void;
}

const DIRECTIONS: readonly {
  value: TextOrientation;
  title: string;
  tip: string;
}[] = [
  {
    value: "horizontal",
    title: "Horizontal text, lines from the top",
    tip: "Write horizontally, lines from the top",
  },
  {
    value: "vertical",
    title: "Vertical text, columns from the right",
    tip: "Write vertically, columns from the right",
  },
];

// Lines of text, as an icon: three lines across, or three columns down.
function DirectionIcon({ vertical }: { vertical: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={vertical ? "M3 2v10M7 2v10M11 2v10" : "M2 3h10M2 7h10M2 11h10"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// What the text view has in the place of the grid's block, show and search: how
// the text is set. The font size stays with the slider, which both views share.
export function TextControls({
  size,
  onSizeChange,
  style,
  onChange,
  onCommit,
}: TextControlsProps) {
  const clampSize = (value: number) =>
    clamp(Math.round(value), MIN_TEXT_SIZE, MAX_TEXT_SIZE);
  return (
    <>
      <fieldset className="segmented segmented-icons">
        <legend className="sr-only">Direction</legend>
        {DIRECTIONS.map(({ value, title, tip }) => (
          <button
            key={value}
            type="button"
            aria-pressed={style.orientation === value}
            aria-label={title}
            data-tip={tip}
            onMouseDown={keepFocus}
            onClick={() => onChange({ ...style, orientation: value })}
          >
            <DirectionIcon vertical={value === "vertical"} />
          </button>
        ))}
      </fieldset>
      <span className="toolbar-group">
        <Field label="Size">
          {(id) => (
            <NumberField
              id={id}
              value={size}
              min={MIN_TEXT_SIZE}
              max={MAX_TEXT_SIZE}
              step={TEXT_SIZE_STEP}
              unit="px"
              label="Font size"
              title="Font size, in pixels"
              onChange={(value) =>
                value !== null && onSizeChange(clampSize(value))
              }
              onStep={(direction) =>
                onSizeChange(stepTextSize(size, direction))
              }
              canStep={(direction) =>
                direction < 0 ? size > MIN_TEXT_SIZE : size < MAX_TEXT_SIZE
              }
              onCommit={onCommit}
            />
          )}
        </Field>
        <Field label="Line">
          {(id) => (
            <NumberField
              id={id}
              value={style.lineHeight}
              min={MIN_LINE_HEIGHT}
              max={MAX_LINE_HEIGHT}
              step={LINE_STEP}
              auto="Auto"
              unit="×"
              label="Line spacing"
              title="Line spacing, as a multiple of the font size. In vertical text it spaces the columns. Auto uses the font's own."
              onChange={(value) =>
                onChange({ ...style, lineHeight: normalizeLineHeight(value) })
              }
              onStep={(direction) =>
                onChange({
                  ...style,
                  lineHeight: normalizeLineHeight(
                    (style.lineHeight ?? DEFAULT_TEXT_STYLE.lineHeight ?? 1.5) +
                      direction * LINE_STEP,
                  ),
                })
              }
              canStep={(direction) =>
                direction < 0
                  ? style.lineHeight === null ||
                    style.lineHeight > MIN_LINE_HEIGHT
                  : style.lineHeight === null ||
                    style.lineHeight < MAX_LINE_HEIGHT
              }
              onCommit={onCommit}
            />
          )}
        </Field>
        <Field label="Letter">
          {(id) => (
            <NumberField
              id={id}
              value={style.letterSpacing}
              min={MIN_LETTER_SPACING}
              max={MAX_LETTER_SPACING}
              step={LETTER_STEP}
              unit="%"
              label="Letter spacing"
              title="Letter spacing, as a percentage of the font size"
              onChange={(value) =>
                onChange({
                  ...style,
                  letterSpacing: normalizeLetterSpacing(value ?? 0),
                })
              }
              onStep={(direction) =>
                onChange({
                  ...style,
                  letterSpacing: normalizeLetterSpacing(
                    style.letterSpacing + direction * LETTER_STEP,
                  ),
                })
              }
              canStep={(direction) =>
                direction < 0
                  ? style.letterSpacing > MIN_LETTER_SPACING
                  : style.letterSpacing < MAX_LETTER_SPACING
              }
              onCommit={onCommit}
            />
          )}
        </Field>
      </span>
    </>
  );
}
