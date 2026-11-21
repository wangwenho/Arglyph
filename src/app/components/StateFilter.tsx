import type { StateCounts } from "../../core/glyph/state.ts";
import {
  FILTER_ALL,
  FILTER_BLANK,
  FILTER_DRAWN,
  FILTER_MAPPED,
  FILTER_MISSING,
  FILTER_UNDRAWN,
} from "../../core/grid/filters.ts";
import { formatCount } from "../lib/format.ts";
import { type PickerOption, PickerPanel } from "./PickerPanel.tsx";

export interface StateFilterProps {
  /** One of the FILTER_* values, as resolveStateFilter returned it. */
  value: string;
  onChange(value: string): void;
  /** The states of the glyphs shown: the chosen block, or the whole font. */
  counts: StateCounts;
  /** A block is chosen: the characters the font lacks can be shown. */
  blockChosen: boolean;
  /** The font file said which glyphs are empty; without that there is no Drawn or Undrawn. */
  outlinesKnown: boolean;
  onCommit(): void;
}

// Which glyphs to show, in the words of core/glyph/state.ts. Each option says how
// many it would show, so the numbers add up: Mapped + Missing is everything.
// "Missing" and "Mapped + Missing" are about the characters of a block, so they
// wait for one to be chosen.
export function StateFilter({
  value,
  onChange,
  counts,
  blockChosen,
  outlinesKnown,
  onCommit,
}: StateFilterProps) {
  const mapped = counts.drawn + counts.blank + counts.undrawn;
  const option = (
    optionValue: string,
    name: string,
    count: number,
    needsBlock = false,
  ): PickerOption => {
    const text =
      needsBlock && !blockChosen ? "choose a block" : formatCount(count);
    return {
      value: optionValue,
      name,
      count: text,
      label: `${name} (${text})`,
      disabled: needsBlock && !blockChosen,
    };
  };
  const options = [
    option(FILTER_MAPPED, "Mapped", mapped),
    ...(outlinesKnown ? [option(FILTER_DRAWN, "Drawn", counts.drawn)] : []),
    ...(outlinesKnown ? [option(FILTER_BLANK, "Blank", counts.blank)] : []),
    ...(outlinesKnown
      ? [option(FILTER_UNDRAWN, "Undrawn", counts.undrawn)]
      : []),
    option(FILTER_MISSING, "Missing", counts.missing, true),
    option(FILTER_ALL, "Mapped + Missing", mapped + counts.missing, true),
  ];
  return (
    <PickerPanel
      field="Show"
      ariaLabel="Show"
      title="Show glyphs by state, or the characters the font lacks"
      className="state-filter"
      entries={options.map((o) => ({ kind: "option" as const, option: o }))}
      value={value}
      onChange={onChange}
      onCommit={onCommit}
    />
  );
}
