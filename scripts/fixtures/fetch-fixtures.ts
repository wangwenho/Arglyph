// Put the test fonts in place.
//
//   pnpm fetch:fixtures            download what is missing, make the synthetic font
//   pnpm fetch:fixtures --force    download again, replacing what differs
//
// The list is in scripts/fixtures/fonts.ts: each font names a commit of its own
// repository and a SHA-256. A file that is already there with the right hash is
// left alone (nothing is downloaded, so this is cheap to run every time, and CI
// can cache the folder). One that is there but differs, say your own copy of the
// font, is kept and reported, unless you say --force. A download whose hash is
// wrong is never written.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOWNLOADS, FONTS } from "./fonts.ts";
import { writeSynthesizedFont } from "./synthetic-fonts.ts";

const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** What to do about one font, given what is on disk: "have", "differs" or "missing". */
export function stateOf(
  file: string,
  expected: string,
): "have" | "differs" | "missing" {
  if (!existsSync(file)) return "missing";
  return sha256(readFileSync(file)) === expected ? "have" : "differs";
}

async function download({
  url,
  sha256: expected,
}: {
  url: string;
  sha256: string;
}): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const got = sha256(bytes);
  if (got !== expected) {
    throw new Error(
      `The download of ${url} has the hash ${got}, not ${expected}`,
    );
  }
  return bytes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes("--force");
  let failed = false;
  for (const entry of DOWNLOADS) {
    const state = stateOf(entry.path, entry.sha256);
    if (state === "have" || (state === "differs" && !force)) {
      console.log(
        state === "have"
          ? `have      ${entry.path}`
          : `differs   ${entry.path} (kept; --force replaces it)`,
      );
      continue;
    }
    try {
      const bytes = await download(entry);
      mkdirSync(path.dirname(entry.path), { recursive: true });
      writeFileSync(entry.path, bytes);
      console.log(
        `fetched   ${entry.path} (${(bytes.length / 1048576).toFixed(1)} MB)`,
      );
    } catch (error) {
      failed = true;
      console.error(
        `FAILED    ${entry.path}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  writeSynthesizedFont(FONTS.synthesized);
  console.log(`made      ${FONTS.synthesized}`);
  process.exit(failed ? 1 : 0);
}
