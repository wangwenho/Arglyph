import { LAYER_LIST } from "../../core/zoom/layers.ts";

// Every key and gesture the app answers to, written down once. The help window
// shows it, and so do the short hints in the inspector, so what the interface
// says and what the keys do are checked in one place (see shortcuts.test.ts).

/** Which part of the app the keys are for. */
export type HelpContext = "grid" | "zoom" | "text";

export interface Shortcut {
  /** Key combinations, as alternatives. A key is one `<kbd>`; "Mod" is Cmd or Ctrl. */
  keys: readonly (readonly string[])[];
  /** Mouse gestures that do the same, in words. */
  gestures?: readonly string[];
  action: string;
}

export interface ShortcutGroup {
  context: HelpContext | "general";
  title: string;
  /** One line before the list, when the group needs a word of explanation. */
  intro?: string;
  shortcuts: readonly Shortcut[];
}

/** Cmd on a Mac, Ctrl elsewhere. */
export function modifierName(platform = navigator.platform): string {
  return /Mac|iPhone|iPad/i.test(platform) ? "Cmd" : "Ctrl";
}

const GRID: ShortcutGroup = {
  context: "grid",
  title: "Grid",
  shortcuts: [
    {
      keys: [["←", "↑", "↓", "→"]],
      action: "Move the selection",
    },
    {
      keys: [["Space"]],
      gestures: ["Double-click a glyph"],
      action: "Zoom in on the selected glyph",
    },
    { keys: [["Esc"]], action: "Clear the selection" },
    { keys: [["Mod", "F"]], action: "Search" },
    {
      keys: [
        ["Mod", "+"],
        ["Mod", "−"],
      ],
      action: "Bigger or smaller glyphs, one column at a time",
    },
    { keys: [["Mod", "0"]], action: "Back to the default glyph size" },
  ],
};

const ZOOM: ShortcutGroup = {
  context: "zoom",
  title: "Zoom",
  shortcuts: [
    { keys: [["←", "→"]], action: "The previous or next glyph" },
    { keys: [["Space"], ["Esc"]], action: "Close the zoom" },
    {
      keys: [],
      gestures: ["Scroll"],
      action: "Zoom in and out at the pointer",
    },
    {
      keys: [
        ["Mod", "+"],
        ["Mod", "−"],
      ],
      action: "Zoom in and out",
    },
    { keys: [], gestures: ["Drag"], action: "Move the glyph around" },
    {
      keys: [["Mod", "0"]],
      gestures: ["Double-click"],
      action: "Fit the whole em square",
    },
    ...LAYER_LIST.map(({ label, key }) => ({
      keys: [[key.toUpperCase()]],
      action: `Show or hide ${label.toLowerCase()}`,
    })),
  ],
};

const TEXT: ShortcutGroup = {
  context: "text",
  title: "Text",
  intro: "Type in the box: the text is set in the font itself.",
  shortcuts: [
    {
      keys: [["←", "↑", "↓", "→"]],
      gestures: ["Click in the text"],
      action: "Move the caret; the inspector shows the character at it",
    },
    {
      keys: [["Mod"]],
      gestures: ["Point at a character"],
      action: "Show that character in the inspector while the key is held",
    },
    {
      keys: [["Mod", "Enter"]],
      gestures: ["Click a character with Mod held"],
      action: "Zoom in on that character",
    },
    {
      keys: [["Esc"]],
      action: "Close the zoom and go back to the text",
    },
    {
      keys: [
        ["Mod", "+"],
        ["Mod", "−"],
      ],
      action: "Bigger or smaller text",
    },
    { keys: [["Mod", "0"]], action: "Back to the default text size" },
  ],
};

const SEARCH: ShortcutGroup = {
  context: "general",
  title: "Search",
  intro:
    "Characters (永), code points (U+6C38) and ranges (U+0041-U+005A), several at once, separated by spaces.",
  shortcuts: [
    { keys: [["Enter"]], action: "Select the first result" },
    { keys: [["Esc"]], action: "Clear the box, then go back to the grid" },
  ],
};

const GENERAL: ShortcutGroup = {
  context: "general",
  title: "Anywhere",
  shortcuts: [
    { keys: [["Mod", "G"]], action: "Show the grid" },
    { keys: [["Mod", "T"]], action: "Show the text" },
    { keys: [["Mod", "I"]], action: "Show or hide the inspector" },
    { keys: [["?"]], action: "Show or hide this help" },
  ],
};

const BY_CONTEXT: Record<HelpContext, ShortcutGroup> = {
  grid: GRID,
  zoom: ZOOM,
  text: TEXT,
};

/** The groups, the one for what the user is looking at first. */
export function helpGroups(current: HelpContext): readonly ShortcutGroup[] {
  const order: HelpContext[] = ["grid", "zoom", "text"];
  const rest = order.filter((context) => context !== current);
  return [
    BY_CONTEXT[current],
    ...rest.map((context) => BY_CONTEXT[context]),
    SEARCH,
    GENERAL,
  ];
}

/** The one line the inspector keeps in view for the current context. */
export function contextHint(context: HelpContext, mod: string): string {
  switch (context) {
    case "grid":
      return "Press Space or double-click to zoom in on the selected glyph.";
    case "zoom":
      return "Press Space or Esc to go back; ← and → show the previous and next glyph.";
    case "text":
      return `This shows the character at the caret. Hold ${mod} and point at another to see it instead; ${mod}+click or ${mod}+Enter zooms in.`;
  }
}
