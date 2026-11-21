// Write THIRD_PARTY_NOTICES: the licenses of what the extension carries that is
// not ours, which is what those licenses ask for. MIT and the Unicode License both
// say the notice must travel with the software, and webview.js has none: the
// bundler drops the comments the notices were in.
//
//   pnpm gen:notices
//
// Offline. What goes in is worked out, not listed: every package the source
// imports (React, opentype.js, ...) and whatever those need in turn, read from
// node_modules, plus the Unicode data. A package with no license file stops the
// script, so nothing is shipped without its notice.
//
// buildNotices() is the whole job and has no side effects; a test compares what it
// returns with the committed file, so a new dependency, an upgrade, or a change
// here that was not followed by `pnpm gen:notices` does not go unnoticed.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UCD_LICENSE_FILE, UNICODE_VERSION } from "./unicode/unicode-config.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NOTICES_FILE = "THIRD_PARTY_NOTICES";

// Not packages of npm: the editor's API, Node's own modules.
const NOT_BUNDLED = new Set(["vscode", ...builtinModules]);
const PACKAGE_NAME = /^(@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]*$/;

/** The parts of a package.json this script reads. */
interface Manifest {
  name: string;
  version: string;
  license?: string;
  repository?: string | { url?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
}

interface Package {
  dir: string;
  manifest: Manifest;
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|cts)$/.test(entry.name) && !/\.test\./.test(entry.name))
      yield full;
  }
}

/** The npm packages the source imports, by name, sorted. */
export function importedPackages(): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(path.join(ROOT, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const [, specifier] of text.matchAll(/(?:from|import)\s+"([^"]+)"/g)) {
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      const parts = specifier.split("/");
      const name = specifier.startsWith("@")
        ? parts.slice(0, 2).join("/")
        : parts[0];
      if (PACKAGE_NAME.test(name) && !NOT_BUNDLED.has(name)) found.add(name);
    }
  }
  return [...found].sort();
}

/** The folder of package `name` as seen from `fromDir`, the way Node looks for it. */
function findPackage(name: string, fromDir: string): string {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    // Inside a node_modules folder the packages lie side by side (pnpm keeps a
    // package's own dependencies next to it).
    const candidates = [path.join(dir, "node_modules", name)];
    if (path.basename(dir) === "node_modules")
      candidates.push(path.join(dir, name));
    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, "package.json"))) {
        return realpathSync(candidate);
      }
    }
    if (path.dirname(dir) === dir) {
      throw new Error(`Package ${name} not found from ${fromDir}`);
    }
  }
}

/** Every package of `names` and the packages they depend on, sorted by name. */
function closure(names: string[]): Package[] {
  const seen = new Map<string, Package>();
  const visit = (name: string, fromDir: string): void => {
    const dir = findPackage(name, fromDir);
    const manifest: Manifest = JSON.parse(
      readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    if (seen.has(manifest.name)) return;
    seen.set(manifest.name, { dir, manifest });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      visit(dependency, dir);
    }
  };
  for (const name of names) visit(name, ROOT);
  return [...seen.values()].sort((a, b) =>
    a.manifest.name.localeCompare(b.manifest.name),
  );
}

function licenseText(dir: string, name: string): string {
  const file = readdirSync(dir).find((f) =>
    /^(license|licence)(\.|$)/i.test(f),
  );
  if (!file) throw new Error(`${name} has no license file in ${dir}`);
  return readFileSync(path.join(dir, file), "utf8");
}

function repositoryOf(manifest: Manifest): string {
  const repository = manifest.repository;
  const url = typeof repository === "string" ? repository : repository?.url;
  return (url ?? manifest.homepage ?? "")
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
}

const tidy = (text: string) => text.replace(/\r\n/g, "\n").trim();
const RULE = "=".repeat(78);

/** The text of THIRD_PARTY_NOTICES for the current source and node_modules. */
export function buildNotices(): string {
  const sections = closure(importedPackages()).map(({ dir, manifest }) => {
    const heading = `${manifest.name} ${manifest.version} (${manifest.license})`;
    const url = repositoryOf(manifest);
    return [heading, url, "", tidy(licenseText(dir, manifest.name))]
      .filter((line, index) => index !== 1 || line !== "")
      .join("\n");
  });
  sections.push(
    [
      `Unicode Character Database ${UNICODE_VERSION} (Unicode License v3)`,
      "https://www.unicode.org/ucd/",
      "The block names, the character categories and the assigned code points of",
      "src/core/unicode/data.generated.ts come from it.",
      "",
      tidy(readFileSync(path.join(ROOT, UCD_LICENSE_FILE), "utf8")),
    ].join("\n"),
  );
  return `${[
    "Third-party notices",
    "",
    "Arglyph contains the software and data below. Each comes with its own license,",
    "reproduced here as it asks. This file is made by `pnpm gen:notices`: do not edit it.",
    "",
    sections.join(`\n\n${RULE}\n\n`),
  ].join("\n")}\n`;
}

// Run as a command (not when a test imports it).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { writeFileSync } = await import("node:fs");
  const text = buildNotices();
  writeFileSync(path.join(ROOT, NOTICES_FILE), text);
  const count = text.split(RULE).length;
  console.log(`${NOTICES_FILE}: ${count} notices`);
}
