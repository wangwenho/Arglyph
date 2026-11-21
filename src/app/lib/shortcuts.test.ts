import { describe, expect, it } from "vitest";
import { LAYER_LIST } from "../../core/zoom/layers.ts";
import { contextHint, helpGroups, modifierName } from "./shortcuts.ts";

describe("helpGroups", () => {
  it("puts the group of what the user is looking at first, and lists everything once", () => {
    for (const current of ["grid", "zoom", "text"] as const) {
      const groups = helpGroups(current);
      expect(groups[0].context).toBe(current);
      expect(new Set(groups.map((g) => g.title)).size).toBe(groups.length);
      expect(groups.map((g) => g.title)).toEqual(
        expect.arrayContaining(["Grid", "Zoom", "Text", "Search"]),
      );
    }
  });

  it("lists the key of every layer the zoom view has, so a new layer cannot be left out", () => {
    const zoom = helpGroups("zoom")[0];
    const keys = zoom.shortcuts.flatMap((s) => s.keys.flat());
    for (const { key } of LAYER_LIST) expect(keys).toContain(key.toUpperCase());
  });

  it("lists the keys that switch the view and change the size, in the view they work in", () => {
    const combos = (context: "grid" | "text" | "zoom") =>
      helpGroups(context)
        .flatMap((g) => g.shortcuts)
        .flatMap((s) => s.keys.map((k) => k.join("+")));
    for (const context of ["grid", "text", "zoom"] as const) {
      expect(combos(context)).toEqual(
        expect.arrayContaining(["Mod+G", "Mod+T", "Mod+I", "Mod++", "Mod+0"]),
      );
    }
    // Each of the views that take the size keys says so in its own group.
    for (const context of ["grid", "text"] as const) {
      expect(
        helpGroups(context)[0].shortcuts.flatMap((s) =>
          s.keys.map((k) => k.join("+")),
        ),
      ).toEqual(expect.arrayContaining(["Mod++", "Mod+0"]));
    }
  });

  it("names the key that opens the help", () => {
    const keys = helpGroups("grid")
      .flatMap((g) => g.shortcuts)
      .flatMap((s) => s.keys.flat());
    expect(keys).toContain("?");
  });
});

describe("modifierName", () => {
  it("is Cmd on a Mac and Ctrl elsewhere", () => {
    expect(modifierName("MacIntel")).toBe("Cmd");
    expect(modifierName("Win32")).toBe("Ctrl");
    expect(modifierName("Linux x86_64")).toBe("Ctrl");
  });
});

describe("contextHint", () => {
  it("says something different for each view and uses the modifier the system has", () => {
    const hints = (["grid", "zoom", "text"] as const).map((c) =>
      contextHint(c, "Ctrl"),
    );
    expect(new Set(hints).size).toBe(3);
    expect(hints[2]).toContain("Ctrl");
  });
});
