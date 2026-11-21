import { describe, expect, it } from "vitest";
import { DEFAULT_LAYERS } from "../core/zoom/layers.ts";
import {
  readSavedBrowse,
  readSavedGlyphSize,
  readSavedInspectorOpen,
  readSavedInspectorWidth,
  readSavedLayers,
  readSavedMode,
  readSavedText,
  readSavedTextSize,
  readSavedTextStyle,
  readSavedUi,
  readSavedView,
  writeSavedUi,
} from "./saved-codec.ts";

describe("readSavedView", () => {
  const saved = {
    name: "Roboto.ttf",
    anchorKey: 0x4e00,
    anchorOffset: 17,
    selectedKey: 0x4e2d,
  };

  it("returns the position saved for the same file", () => {
    expect(readSavedView(saved, "Roboto.ttf")).toEqual({
      anchorKey: 0x4e00,
      anchorOffset: 17,
      selectedKey: 0x4e2d,
    });
  });

  it("accepts null keys (nothing selected, empty font) and negative keys (unmapped glyphs)", () => {
    expect(
      readSavedView(
        { ...saved, anchorKey: -5, selectedKey: null },
        "Roboto.ttf",
      ),
    ).toEqual({ anchorKey: -5, anchorOffset: 17, selectedKey: null });
  });

  it("ignores a state saved for another file", () => {
    expect(readSavedView(saved, "Other.ttf")).toBeUndefined();
  });

  it("ignores values that are not a saved state", () => {
    expect(readSavedView(undefined, "Roboto.ttf")).toBeUndefined();
    expect(readSavedView(null, "Roboto.ttf")).toBeUndefined();
    expect(readSavedView("text", "Roboto.ttf")).toBeUndefined();
    expect(
      readSavedView({ ...saved, anchorKey: "1" }, "Roboto.ttf"),
    ).toBeUndefined();
    expect(
      readSavedView({ ...saved, selectedKey: 1.5 }, "Roboto.ttf"),
    ).toBeUndefined();
    expect(
      readSavedView({ ...saved, anchorOffset: Number.NaN }, "Roboto.ttf"),
    ).toBeUndefined();
  });

  it("ignores the old format (scrollTop and selectedIndex)", () => {
    expect(
      readSavedView(
        { name: "Roboto.ttf", scrollTop: 480, selectedIndex: 12 },
        "Roboto.ttf",
      ),
    ).toBeUndefined();
  });

  it("clamps a negative offset", () => {
    expect(
      readSavedView({ ...saved, anchorOffset: -5 }, "Roboto.ttf")?.anchorOffset,
    ).toBe(0);
  });
});

describe("readSavedGlyphSize", () => {
  it("returns the saved size, whatever file it was saved for", () => {
    expect(readSavedGlyphSize({ name: "A.ttf", glyphSize: 96 })).toBe(96);
  });

  it("is undefined when nothing usable was saved", () => {
    expect(readSavedGlyphSize(undefined)).toBeUndefined();
    expect(readSavedGlyphSize(null)).toBeUndefined();
    expect(readSavedGlyphSize({})).toBeUndefined();
    expect(readSavedGlyphSize({ glyphSize: "96" })).toBeUndefined();
    expect(readSavedGlyphSize({ glyphSize: Number.NaN })).toBeUndefined();
  });

  it("keeps the size inside the slider's range and rounds it", () => {
    expect(readSavedGlyphSize({ glyphSize: 5 })).toBe(48);
    expect(readSavedGlyphSize({ glyphSize: 9000 })).toBe(128);
    expect(readSavedGlyphSize({ glyphSize: 72.6 })).toBe(73);
  });
});

describe("readSavedLayers", () => {
  it("returns the layers that were saved", () => {
    const layers = { ...DEFAULT_LAYERS, fill: false, outline: true };
    expect(readSavedLayers({ layers })).toEqual(layers);
  });

  it("keeps the default for a layer that is missing or not a boolean", () => {
    expect(readSavedLayers({ layers: { fill: false, layout: "no" } })).toEqual({
      ...DEFAULT_LAYERS,
      fill: false,
    });
  });

  it("is undefined when nothing usable was saved", () => {
    expect(readSavedLayers(undefined)).toBeUndefined();
    expect(readSavedLayers({})).toBeUndefined();
    expect(readSavedLayers({ layers: "all" })).toBeUndefined();
    expect(readSavedLayers({ layers: null })).toBeUndefined();
  });
});

describe("readSavedText and readSavedTextSize", () => {
  it("return what was saved", () => {
    expect(readSavedText({ text: "國永" })).toBe("國永");
    expect(readSavedText({ text: "" })).toBe("");
    expect(readSavedTextSize({ textSize: 40 })).toBe(40);
  });

  it("ignore what is not a text or a size", () => {
    expect(readSavedText(undefined)).toBeUndefined();
    expect(readSavedText({ text: 3 })).toBeUndefined();
    expect(readSavedTextSize({ textSize: "big" })).toBeUndefined();
    expect(readSavedTextSize({ textSize: Number.NaN })).toBeUndefined();
  });

  it("keep the size in the slider's range and the text in its limit", () => {
    expect(readSavedTextSize({ textSize: 1 })).toBe(12);
    expect(readSavedTextSize({ textSize: 9999 })).toBe(128);
    expect(readSavedText({ text: "a".repeat(6000) })).toHaveLength(5000);
  });
});

describe("readSavedTextStyle", () => {
  it("returns what was saved", () => {
    expect(
      readSavedTextStyle({
        textStyle: {
          orientation: "vertical",
          lineHeight: 2,
          letterSpacing: 5,
        },
      }),
    ).toEqual({ orientation: "vertical", lineHeight: 2, letterSpacing: 5 });
  });

  it("keeps the font's own line height (null) as a value", () => {
    expect(
      readSavedTextStyle({
        textStyle: { orientation: "horizontal", lineHeight: null },
      })?.lineHeight,
    ).toBeNull();
  });

  it("gives a part that is missing or wrong its default, and keeps the rest in range", () => {
    expect(
      readSavedTextStyle({
        textStyle: {
          orientation: "sideways",
          lineHeight: "2",
          letterSpacing: 900,
        },
      }),
    ).toEqual({
      orientation: "horizontal",
      lineHeight: 1.5,
      letterSpacing: 50,
    });
  });

  it("is nothing when no style was saved", () => {
    expect(readSavedTextStyle(undefined)).toBeUndefined();
    expect(readSavedTextStyle({})).toBeUndefined();
    expect(readSavedTextStyle({ textStyle: "vertical" })).toBeUndefined();
  });
});

describe("readSavedInspectorWidth", () => {
  it("returns the width that was saved, kept in range", () => {
    expect(readSavedInspectorWidth({ inspectorWidth: 320 })).toBe(320);
    expect(readSavedInspectorWidth({ inspectorWidth: 50 })).toBe(240);
    expect(readSavedInspectorWidth({ inspectorWidth: 9000 })).toBe(480);
  });

  it("is nothing when there is none or it is not a number", () => {
    expect(readSavedInspectorWidth(undefined)).toBeUndefined();
    expect(readSavedInspectorWidth({})).toBeUndefined();
    expect(readSavedInspectorWidth({ inspectorWidth: "300" })).toBeUndefined();
    expect(
      readSavedInspectorWidth({ inspectorWidth: Number.NaN }),
    ).toBeUndefined();
  });
});

describe("readSavedMode", () => {
  it("brings back the text view, with the zoom view open on a character of it", () => {
    expect(
      readSavedMode({ view: "text", zoomOpen: false, looking: 7 }),
    ).toEqual({ view: "text", zoomOpen: false, looking: 7 });
  });

  it("brings back the zoom view over the grid", () => {
    expect(
      readSavedMode({ view: "grid", zoomOpen: true, looking: null }),
    ).toEqual({ view: "grid", zoomOpen: true, looking: null });
  });

  it("drops what cannot go with the view: no zoom flag over text, no offset over the grid", () => {
    expect(
      readSavedMode({ view: "text", zoomOpen: true, looking: null }),
    ).toEqual({ view: "text", zoomOpen: false, looking: null });
    expect(readSavedMode({ view: "grid", zoomOpen: true, looking: 3 })).toEqual(
      { view: "grid", zoomOpen: true, looking: null },
    );
  });

  it("falls back to the grid with nothing open for what it does not understand", () => {
    const grid = { view: "grid", zoomOpen: false, looking: null };
    expect(readSavedMode({})).toEqual(grid);
    expect(readSavedMode({ view: "list", zoomOpen: "yes" })).toEqual(grid);
  });

  it("ignores an offset that is not a position in the text", () => {
    for (const looking of [-1, 1.5, "2", Number.NaN]) {
      expect(readSavedMode({ view: "text", looking })?.looking).toBeNull();
    }
  });

  it("has nothing for a state saved before the mode existed, or no state", () => {
    expect(readSavedMode(undefined)).toBeUndefined();
    expect(readSavedMode(null)).toBeUndefined();
    expect(readSavedMode("text")).toBeUndefined();
    // an old save has the other fields but no view: the grid, as it always was
    expect(readSavedMode({ name: "a.ttf", glyphSize: 80 })).toEqual({
      view: "grid",
      zoomOpen: false,
      looking: null,
    });
  });
});

describe("readSavedBrowse", () => {
  it("brings back the block, the Show filter and the search", () => {
    expect(
      readSavedBrowse({ block: "4E00", filter: "undrawn", search: "U+4E00" }),
    ).toEqual({ block: "4E00", filter: "undrawn", search: "U+4E00" });
  });

  it("starts what is missing or not a valid value from nothing chosen", () => {
    const none = { block: "all", filter: "mapped", search: "" };
    expect(readSavedBrowse({})).toEqual(none);
    expect(
      readSavedBrowse({ block: 3, filter: "rainbow", search: null }),
    ).toEqual(none);
  });

  it("keeps the search to a length the box could hold", () => {
    expect(readSavedBrowse({ search: "x".repeat(500) })?.search).toHaveLength(
      200,
    );
  });

  it("has nothing for no state", () => {
    expect(readSavedBrowse(undefined)).toBeUndefined();
    expect(readSavedBrowse("all")).toBeUndefined();
  });
});

describe("readSavedInspectorOpen", () => {
  it("brings back what the user chose, open or closed", () => {
    expect(readSavedInspectorOpen({ inspectorOpen: true })).toBe(true);
    expect(readSavedInspectorOpen({ inspectorOpen: false })).toBe(false);
  });

  it("is undefined when they never chose, so the panel width decides", () => {
    expect(readSavedInspectorOpen({})).toBeUndefined();
    expect(readSavedInspectorOpen({ inspectorOpen: "yes" })).toBeUndefined();
    expect(readSavedInspectorOpen(undefined)).toBeUndefined();
  });
});

describe("readSavedUi and writeSavedUi", () => {
  it("read back what was written, part by part", () => {
    const ui = {
      glyphSize: 96,
      layers: { ...DEFAULT_LAYERS, points: true },
      text: "國永",
      textSize: 40,
      textStyle: {
        orientation: "vertical" as const,
        lineHeight: 2,
        letterSpacing: 5,
      },
      inspectorWidth: 320,
      inspectorOpen: false,
      mode: { view: "text" as const, zoomOpen: false, looking: 3 },
      browse: { block: "4E00", filter: "drawn", search: "U+4E00" },
    };
    expect(readSavedUi(writeSavedUi(ui))).toEqual(ui);
  });

  it("leave out what was never saved", () => {
    const ui = readSavedUi(undefined);
    expect(Object.values(ui).every((part) => part === undefined)).toBe(true);
  });

  it("write only the parts that are there, so a missing part stays missing", () => {
    expect(writeSavedUi({ glyphSize: 80 })).toEqual({ glyphSize: 80 });
  });
});
