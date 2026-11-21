import { describe, expect, it } from "vitest";
import {
  describeCopied,
  isFileStateMessage,
  isFontMessage,
  MAX_COPY_LENGTH,
  readCopyArgument,
  readToHost,
} from "./protocol.ts";

describe("isFontMessage", () => {
  const data = new ArrayBuffer(8);

  it("accepts a font message, with or without the reload flag", () => {
    expect(isFontMessage({ type: "font", name: "a.ttf", data })).toBe(true);
    expect(
      isFontMessage({ type: "font", name: "a.ttf", data, reload: true }),
    ).toBe(true);
  });

  it("rejects anything that is not exactly that", () => {
    expect(isFontMessage({ type: "ready" })).toBe(false);
    expect(isFontMessage({ type: "font", name: "a.ttf" })).toBe(false);
    // A Uint8Array is not what VS Code delivers: an ArrayBuffer is.
    expect(
      isFontMessage({ type: "font", name: "a.ttf", data: new Uint8Array(8) }),
    ).toBe(false);
    expect(isFontMessage({ type: "font", name: 1, data })).toBe(false);
    expect(
      isFontMessage({ type: "font", name: "a.ttf", data, reload: "yes" }),
    ).toBe(false);
    expect(isFontMessage(null)).toBe(false);
    expect(isFontMessage("font")).toBe(false);
  });
});

describe("readToHost", () => {
  it("reads the three messages a webview sends", () => {
    expect(readToHost({ type: "ready" })).toEqual({ type: "ready" });
    expect(
      readToHost({ type: "error", name: "a.ttf", message: "bad" }),
    ).toEqual({ type: "error", name: "a.ttf", message: "bad" });
    expect(readToHost({ type: "copy", text: "U+4E00" })).toEqual({
      type: "copy",
      text: "U+4E00",
    });
  });

  it("keeps only the known fields", () => {
    expect(readToHost({ type: "ready", extra: 1 })).toEqual({ type: "ready" });
  });

  it("rejects unknown types, missing fields and values that are not objects", () => {
    expect(readToHost({ type: "unknown" })).toBeNull();
    expect(readToHost({ type: "error", name: "a.ttf" })).toBeNull();
    expect(readToHost({ type: "copy" })).toBeNull();
    expect(readToHost(null)).toBeNull();
    expect(readToHost("ready")).toBeNull();
  });

  it("refuses to copy nothing, or more than a code point or a character", () => {
    expect(readToHost({ type: "copy", text: "" })).toBeNull();
    expect(
      readToHost({ type: "copy", text: "x".repeat(MAX_COPY_LENGTH) }),
    ).not.toBeNull();
    expect(
      readToHost({ type: "copy", text: "x".repeat(MAX_COPY_LENGTH + 1) }),
    ).toBeNull();
  });
});

describe("isFileStateMessage", () => {
  it("accepts a file state, and nothing else", () => {
    expect(isFileStateMessage({ type: "file-state", readable: false })).toBe(
      true,
    );
    expect(isFileStateMessage({ type: "file-state", readable: "no" })).toBe(
      false,
    );
    expect(isFileStateMessage({ type: "file-state" })).toBe(false);
    expect(isFileStateMessage({ type: "font", readable: true })).toBe(false);
    expect(isFileStateMessage(null)).toBe(false);
  });
});

describe("describeCopied", () => {
  it("names what was copied, the same way for both commands", () => {
    expect(describeCopied("codePoint", "U+4E00")).toBe(
      "Arglyph: copied U+4E00",
    );
    expect(describeCopied("character", "一")).toBe("Arglyph: copied 一");
    expect(describeCopied("character", "𠀀")).toBe("Arglyph: copied 𠀀");
  });

  it("does not print a character that would show as nothing or as a box", () => {
    for (const text of [" ", "​", "́", "", "\u0000"]) {
      expect(describeCopied("character", text)).toBe(
        "Arglyph: copied the character",
      );
    }
  });
});

describe("readCopyArgument", () => {
  // What VS Code gives a command run from the menu: the context of the element
  // that was clicked, with its own keys (`webview`) added.
  const context = {
    webview: "x",
    webviewSection: "arglyph.glyph",
    codePoint: "U+4E00",
    character: "一",
    preventDefaultContextMenuItems: true,
  };

  it("reads the code point and the character", () => {
    expect(readCopyArgument(context, "codePoint")).toBe("U+4E00");
    expect(readCopyArgument(context, "character")).toBe("一");
  });

  it("is null for a field that is missing, empty, too long or not text", () => {
    expect(readCopyArgument({ codePoint: "U+0041" }, "character")).toBeNull();
    expect(readCopyArgument({ character: "" }, "character")).toBeNull();
    expect(
      readCopyArgument(
        { character: "x".repeat(MAX_COPY_LENGTH + 1) },
        "character",
      ),
    ).toBeNull();
    expect(readCopyArgument({ codePoint: 65 }, "codePoint")).toBeNull();
  });

  it("is null for anything that is not an object (the Command Palette gives nothing)", () => {
    expect(readCopyArgument(undefined, "codePoint")).toBeNull();
    expect(readCopyArgument(null, "codePoint")).toBeNull();
    expect(readCopyArgument("U+0041", "codePoint")).toBeNull();
  });
});
