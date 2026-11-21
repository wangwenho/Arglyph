import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { stateOf } from "./fetch-fixtures.ts";
import { DOWNLOADS } from "./fonts.ts";

it("tells a font that is there, one that differs, and one that is missing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fixtures-"));
  const file = path.join(dir, "font.ttf");
  const hash = createHash("sha256").update("abc").digest("hex");
  expect(stateOf(file, hash)).toBe("missing");
  writeFileSync(file, "abc");
  expect(stateOf(file, hash)).toBe("have");
  writeFileSync(file, "abd");
  expect(stateOf(file, hash)).toBe("differs");
});

it("downloads from a commit, never from a branch, and checks every file", () => {
  expect(DOWNLOADS.length).toBeGreaterThan(0);
  for (const { url, sha256, path: file } of DOWNLOADS) {
    expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
    expect(url).toMatch(/\/[0-9a-f]{40}\//);
    expect(url).not.toMatch(/\/(main|master)\//);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.startsWith("test/fixtures/fonts/")).toBe(true);
  }
  expect(new Set(DOWNLOADS.map((d) => d.path)).size).toBe(DOWNLOADS.length);
});
