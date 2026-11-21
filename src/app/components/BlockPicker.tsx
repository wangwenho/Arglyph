import { useMemo } from "react";
import {
  ALL_ITEMS,
  type BlockCoverage,
  blockChoiceValue,
  NO_CODEPOINT,
} from "../../core/grid/blocks.ts";
import {
  groupBlocksByPlane,
  planeName,
  type UnicodeBlock,
} from "../../core/unicode/blocks.ts";
import { expectedCount } from "../../core/unicode/categories.ts";
import { formatCount } from "../lib/format.ts";
import { type PickerEntry, PickerPanel } from "./PickerPanel.tsx";

export interface BlockPickerProps {
  blocks: readonly UnicodeBlock[];
  /** The blocks the font has code points in, in block order. */
  coverage: readonly BlockCoverage[];
  /** Number of items of the whole font, and of those without a code point. */
  totalCount: number;
  unmappedCount: number;
  /** An option value: ALL_ITEMS, NO_CODEPOINT or blockChoiceValue(block). */
  value: string;
  onChange(value: string): void;
  /** A block was picked; the grid can have the focus back. */
  onCommit(): void;
}

// Which Unicode block to show. Blocks are grouped by plane, and only blocks the
// font maps something in are listed, each with how many characters the font
// maps out of how many a font is expected to have there (a block's range also
// holds unassigned code points, controls and private use, which are not
// counted). A hundred blocks are too many for a drop-down list: a panel with a
// filter box and planes that fold open (see PickerPanel).
export function BlockPicker({
  blocks,
  coverage,
  totalCount,
  unmappedCount,
  value,
  onChange,
  onCommit,
}: BlockPickerProps) {
  const entries: PickerEntry[] = useMemo(() => {
    const byStart = new Map(
      coverage.map((c) => [blocks[c.blockIndex].start, c]),
    );
    const planes = groupBlocksByPlane(
      coverage.map((c) => blocks[c.blockIndex]),
    ).map((group) => ({
      kind: "group" as const,
      group: {
        key: String(group.plane),
        label: `Plane ${group.plane} · ${planeName(group.plane)}`,
        options: group.blocks.map((block) => {
          const mapped = byStart.get(block.start);
          const expected = expectedCount(block.start, block.end);
          // Private use and the like have no characters a font is expected to
          // have, so there is nothing to set the count against.
          const count =
            expected > 0
              ? `${formatCount(mapped?.mappedCharacters ?? 0)} / ${formatCount(expected)}`
              : `${formatCount(mapped?.mapped ?? 0)} mapped`;
          return {
            value: blockChoiceValue(block),
            name: block.name,
            count,
            label: `${block.name} (${count})`,
          };
        }),
      },
    }));
    const word = (name: string, count: number) => ({
      name,
      count: formatCount(count),
      label: `${name} (${formatCount(count)})`,
    });
    return [
      {
        kind: "option" as const,
        option: { value: ALL_ITEMS, ...word("All blocks", totalCount) },
      },
      ...planes,
      ...(unmappedCount > 0
        ? [
            {
              kind: "option" as const,
              option: {
                value: NO_CODEPOINT,
                ...word("Unmapped glyphs", unmappedCount),
              },
            },
          ]
        : []),
    ];
  }, [blocks, coverage, totalCount, unmappedCount]);

  return (
    <PickerPanel
      field="Block"
      ariaLabel="Unicode block"
      title="Unicode block. Each entry counts the characters the font has, out of all the block holds."
      className="block-picker"
      entries={entries}
      value={value}
      filterable
      // Plane 0 and the plane of the chosen block start open.
      initiallyFolded={(chosen) => {
        const own = entries.find(
          (e) =>
            e.kind === "group" &&
            e.group.options.some((o) => o.value === chosen),
        );
        const keep = new Set(["0", own?.kind === "group" ? own.group.key : ""]);
        return new Set(
          entries.flatMap((e) =>
            e.kind === "group" && !keep.has(e.group.key) ? [e.group.key] : [],
          ),
        );
      }}
      onChange={onChange}
      onCommit={onCommit}
    />
  );
}
