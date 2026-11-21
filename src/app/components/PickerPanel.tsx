import { useEffect, useId, useRef, useState } from "react";
import { keepFocus } from "../lib/keep-focus.ts";
import { Field } from "./Field.tsx";
import { OverlayScrollbar } from "./OverlayScrollbar.tsx";

export interface PickerOption {
  value: string;
  /** What is searched, and shown first. */
  name: string;
  /** Shown at the right, lined up with the others (a count). */
  count: string;
  /** The whole line, as the button shows it. */
  label: string;
  /** Shown, but cannot be picked. */
  disabled?: boolean;
}

export interface PickerGroup {
  key: string;
  label: string;
  options: PickerOption[];
}

export type PickerEntry =
  | { kind: "option"; option: PickerOption }
  | { kind: "group"; group: PickerGroup };

export interface PickerPanelProps {
  /** The label in front of the button. */
  field: string;
  /** What the button and the list are called for a screen reader. */
  ariaLabel: string;
  title: string;
  entries: readonly PickerEntry[];
  value: string;
  /** A box on top to filter by name; for a long list. */
  filterable?: boolean;
  /** The groups that start folded when the panel opens. */
  initiallyFolded?(value: string): ReadonlySet<string>;
  className?: string;
  onChange(value: string): void;
  /** Something was picked; the grid can have the focus back. */
  onCommit(): void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={open ? "block-chevron block-chevron-open" : "block-chevron"}
    >
      <path
        d="M3 2l3.5 3L3 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A button that opens a panel to pick one thing from: a
// column of lines, each "name   count" with the counts lined up at the right,
// optionally in groups that fold, and optionally with a filter box on top (type
// "cjk"). A native drop-down cannot group, fold or filter, and looks different on
// every system. The keys are those of a combobox: the filter box (hidden when
// there is no filtering) keeps the focus, the arrows move through what can be
// picked, Enter picks, Escape closes.
export function PickerPanel({
  field,
  ariaLabel,
  title,
  entries,
  value,
  filterable = false,
  initiallyFolded,
  className = "",
  onChange,
  onCommit,
}: PickerPanelProps) {
  const options = entries.flatMap((e) =>
    e.kind === "option" ? [e.option] : e.group.options,
  );
  const current = options.find((o) => o.value === value) ?? options[0];

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<string>(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const needle = filterable ? query.trim().toLowerCase() : "";
  const matches = (option: PickerOption) =>
    needle === "" || option.name.toLowerCase().includes(needle);
  // A group is open when it was opened, or when something in it was found.
  const isOpen = (group: PickerGroup) =>
    needle !== "" ? group.options.some(matches) : !folded.has(group.key);
  // What can be picked and is on the screen, in order: the keys move through this.
  const shown: string[] = entries.flatMap((e) =>
    e.kind === "option"
      ? matches(e.option) && !e.option.disabled
        ? [e.option.value]
        : []
      : isOpen(e.group)
        ? e.group.options
            .filter((o) => matches(o) && !o.disabled)
            .map((o) => o.value)
        : [],
  );
  const anyShown = entries.some((e) =>
    e.kind === "option"
      ? matches(e.option)
      : isOpen(e.group) && e.group.options.some(matches),
  );

  function show() {
    setQuery("");
    setFolded(initiallyFolded ? initiallyFolded(value) : new Set());
    setActive(value);
    setOpen(true);
  }
  function hide(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }
  function pick(option: PickerOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    onCommit();
  }

  // The (possibly hidden) box has the focus while the panel is open.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  // The option the keys are on stays in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it follows the option and the filter
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active, query]);
  // A press outside closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function move(delta: number) {
    if (shown.length === 0) return;
    const at = shown.indexOf(active);
    setActive(
      shown[at < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, at + delta))],
    );
  }

  const optionId = (optionValue: string) =>
    `${listId}-${optionValue.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const renderOption = (option: PickerOption, visible: boolean) => (
    // The options are not focusable: this is a combobox, the filter box keeps the
    // focus and the keys, and says which option is active (aria-activedescendant).
    // biome-ignore lint/a11y/useFocusableInteractive: see above
    // biome-ignore lint/a11y/useKeyWithClickEvents: see above, the keys go to the filter box
    <div
      key={option.value}
      id={optionId(option.value)}
      role="option"
      className="picker-option"
      aria-selected={option.value === value}
      aria-disabled={option.disabled || undefined}
      data-value={option.value}
      data-label={option.label}
      data-active={option.value === active}
      hidden={!visible}
      // The filter box keeps the focus.
      onPointerDown={keepFocus}
      onPointerEnter={() => !option.disabled && setActive(option.value)}
      onClick={() => pick(option)}
    >
      <span className="picker-option-name">{option.name}</span>
      <span className="picker-option-count">{option.count}</span>
    </div>
  );

  return (
    <Field label={field}>
      {(id) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: it only watches where the focus goes, to close the panel when it leaves
        <div
          className={`picker ${className}`}
          ref={rootRef}
          onBlur={(event) => {
            if (
              !rootRef.current?.contains(event.relatedTarget as Node | null)
            ) {
              setOpen(false);
            }
          }}
        >
          <button
            id={id}
            ref={triggerRef}
            type="button"
            className="toolbar-select picker-trigger"
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            data-value={value}
            data-tip={title}
            onClick={() => (open ? hide(false) : show())}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                show();
              }
            }}
          >
            <span className="picker-trigger-label">{current?.label}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2 3.5l3 3 3-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {open && (
            <div
              className={`picker-popup${filterable ? "" : " picker-popup-compact"}`}
            >
              <input
                ref={searchRef}
                type="search"
                className={filterable ? "picker-search" : "sr-only"}
                placeholder="Filter"
                aria-label={filterable ? `Filter ${ariaLabel}` : ariaLabel}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={
                  shown.includes(active) ? optionId(active) : undefined
                }
                readOnly={!filterable}
                spellCheck={false}
                autoComplete="off"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive("");
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === "ArrowDown") move(1);
                  else if (event.key === "ArrowUp") move(-1);
                  else if (event.key === "Home" && needle === "")
                    setActive(shown[0] ?? "");
                  else if (event.key === "End" && needle === "")
                    setActive(shown.at(-1) ?? "");
                  else if (event.key === "Enter") {
                    const target = shown.includes(active) ? active : shown[0];
                    const option = options.find((o) => o.value === target);
                    if (option) pick(option);
                  } else if (event.key === "Escape") hide(true);
                  else if (event.key === "Tab") setOpen(false);
                  else return;
                  if (event.key !== "Tab") {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              />
              <div className="picker-list-frame">
                <div
                  className="picker-list overlay-scroll"
                  role="listbox"
                  id={listId}
                  aria-label={ariaLabel}
                  ref={listRef}
                >
                  {entries.map((entry) => {
                    if (entry.kind === "option") {
                      return renderOption(entry.option, matches(entry.option));
                    }
                    const { group } = entry;
                    const groupOpen = isOpen(group);
                    return (
                      <div key={group.key} className="picker-group-box">
                        <button
                          type="button"
                          className="picker-group"
                          aria-expanded={groupOpen}
                          hidden={needle !== "" && !groupOpen}
                          data-group={group.label}
                          onPointerDown={keepFocus}
                          onClick={() => {
                            if (needle !== "") return;
                            setFolded((previous) => {
                              const next = new Set(previous);
                              if (next.has(group.key)) next.delete(group.key);
                              else next.add(group.key);
                              return next;
                            });
                          }}
                        >
                          <Chevron open={groupOpen} />
                          <span className="picker-group-name">
                            {group.label}
                          </span>
                          <span className="picker-option-count">
                            {group.options.length === 1
                              ? "1 block"
                              : `${group.options.length} blocks`}
                          </span>
                        </button>
                        {group.options.map((option) =>
                          renderOption(option, groupOpen && matches(option)),
                        )}
                      </div>
                    );
                  })}
                  {needle !== "" && !anyShown && (
                    <p className="picker-none">No match for “{query}”.</p>
                  )}
                </div>
                <OverlayScrollbar target={listRef} />
              </div>
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
