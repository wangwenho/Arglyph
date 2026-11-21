import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildNotices, importedPackages, NOTICES_FILE } from "./gen-notices.ts";

it("THIRD_PARTY_NOTICES is what the generator makes of the dependencies", () => {
  // If this fails: run `pnpm gen:notices` and commit the result.
  expect(buildNotices()).toBe(readFileSync(NOTICES_FILE, "utf8"));
});

it("has a notice for what the webview bundles, and for the Unicode data", () => {
  expect(importedPackages()).toEqual(
    expect.arrayContaining(["react", "react-dom", "opentype.js"]),
  );
  const text = buildNotices();
  for (const name of ["react ", "react-dom ", "scheduler ", "opentype.js "]) {
    expect(text).toContain(`\n${name}`);
  }
  expect(text).toContain("Unicode Character Database");
  expect(text).toMatch(/Permission is hereby granted/);
  expect(text).toMatch(/UNICODE LICENSE V3/);
});

it("leaves out what is not shipped: the editor's API and the dev tools", () => {
  const packages = importedPackages();
  expect(packages).not.toContain("vscode");
  expect(packages).not.toContain("vitest");
  expect(packages).not.toContain("vite");
});

it("is not left out of the .vsix", () => {
  const ignored = readFileSync(".vscodeignore", "utf8")
    .split("\n")
    .map((line) => line.trim());
  expect(ignored).not.toContain(NOTICES_FILE);
  expect(ignored).not.toContain("*");
});
