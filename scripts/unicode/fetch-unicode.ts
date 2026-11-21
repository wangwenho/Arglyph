// Download the UCD files we use into data/ucd/, unchanged, over the ones there.
//
//   pnpm fetch:unicode
//
// The version is UNICODE_VERSION in unicode-config.ts: to upgrade, change it
// there, then fetch. The raw files are committed, so an upgrade shows up as a git
// diff and `pnpm gen:unicode` works offline.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  UCD_BASE_URL,
  UCD_DATA_DIR,
  UCD_FILES,
  UNICODE_VERSION,
} from "./unicode-config.ts";

const version = UNICODE_VERSION;
const directory = UCD_DATA_DIR;
await mkdir(directory, { recursive: true });

for (const { name: file, firstLine } of UCD_FILES) {
  const url = `${UCD_BASE_URL}/${version}/ucd/${file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  const text = await response.text();
  // A wrong version or an error page would otherwise be committed silently.
  if (!text.startsWith(firstLine(version))) {
    throw new Error(
      `${url}: unexpected first line ${JSON.stringify(text.split("\n")[0])}`,
    );
  }
  await writeFile(path.join(directory, file), text);
  console.log(`${file}: ${text.length} bytes -> ${directory}`);
}
