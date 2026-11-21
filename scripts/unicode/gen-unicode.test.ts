import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildModule } from "./gen-unicode.ts";
import { GENERATED_FILE, UNICODE_VERSION } from "./unicode-config.ts";

it("the generated Unicode module is what the generator makes of the raw data", async () => {
  const { text } = await buildModule(UNICODE_VERSION);
  // If this fails: run `pnpm gen:unicode` and commit the result.
  expect(text).toBe(readFileSync(GENERATED_FILE, "utf8"));
});
