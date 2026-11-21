// The layers of the source and which way they may depend on each other. This
// test is what keeps the next import from breaking them.
//
//   core         the logic: no React, no VS Code, none of the layers above
//   canvas       the canvas widgets (grid, zoom) and the theme colors they read:
//                core only, no React
//   app          React: core, canvas and protocol.ts, no VS Code
//   extension    the extension host: VS Code and Node, and only protocol.ts of ours
//   webview, dev entry points: they may use everything the browser side has
//   protocol.ts  the messages both sides share: imports nothing

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const SRC = "src";

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (
      /\.(ts|tsx|cts)$/.test(entry.name) &&
      !/\.test\./.test(entry.name)
    ) {
      yield full;
    }
  }
}

/** What a file imports: the text of each specifier. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const found: string[] = [];
  for (const m of text.matchAll(
    /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g,
  ))
    found.push(m[1]);
  for (const m of text.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g))
    found.push(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g))
    found.push(m[1]);
  return found;
}

/** Which layer a resolved path is in. */
function layerOf(resolved: string): string {
  const rel = path.relative(SRC, resolved).split(path.sep);
  if (rel[0].startsWith("..")) return "outside";
  if (rel.length === 1) return rel[0].replace(/\.\w+$/, ""); // protocol
  return rel[0]; // core, canvas, app, extension, webview, dev
}

const BROWSER_PACKAGES = /^(react|react-dom)(\/|$)/;

// layer -> what it must not import
const FORBIDDEN: Record<string, (spec: string, layer: string) => boolean> = {
  core: (spec, layer) =>
    layer === "app" ||
    layer === "canvas" ||
    layer === "extension" ||
    layer === "webview" ||
    layer === "dev" ||
    layer === "protocol" ||
    BROWSER_PACKAGES.test(spec) ||
    spec === "vscode",
  canvas: (spec, layer) =>
    layer === "app" ||
    layer === "extension" ||
    layer === "webview" ||
    layer === "dev" ||
    BROWSER_PACKAGES.test(spec) ||
    spec === "vscode",
  app: (spec, layer) =>
    layer === "extension" ||
    layer === "webview" ||
    layer === "dev" ||
    spec === "vscode",
  extension: (spec, layer) =>
    !(
      spec === "vscode" ||
      spec.startsWith("node:") ||
      layer === "extension" ||
      layer === "protocol"
    ),
  webview: (spec, layer) => layer === "extension" || spec === "vscode",
  protocol: (spec) => spec.startsWith("."),
};

it("each layer of src/ imports only what it may", () => {
  const violations = [];
  for (const file of sourceFiles(SRC)) {
    const own = layerOf(file);
    const forbidden = FORBIDDEN[own];
    if (!forbidden) continue;
    for (const spec of importsOf(file)) {
      const layer = spec.startsWith(".")
        ? layerOf(path.resolve(path.dirname(file), spec))
        : "package";
      if (forbidden(spec, layer))
        violations.push(`${file} imports ${spec} (${layer})`);
    }
  }
  expect(violations).toEqual([]);
});

it("the rules above are looking at the files they should (the test would pass on an empty tree)", () => {
  const layers = new Map();
  for (const file of sourceFiles(SRC))
    layers.set(layerOf(file), (layers.get(layerOf(file)) ?? 0) + 1);
  for (const layer of [
    "core",
    "canvas",
    "app",
    "extension",
    "webview",
    "protocol",
  ]) {
    expect(layers.get(layer) ?? 0, layer).toBeGreaterThan(0);
  }
});
