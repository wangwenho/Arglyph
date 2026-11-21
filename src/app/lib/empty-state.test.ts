import { expect, it } from "vitest";
import { describeEmpty } from "./empty-state.ts";

it("says why the grid is empty, and offers the way out when there is one", () => {
  const none = { filter: "mapped", canWiden: true };
  expect(
    describeEmpty({ ...none, outcome: { kind: "elsewhere", count: 3 } }),
  ).toMatchObject({
    title: "No match in this block",
    detail: "3 matches in other blocks",
    action: { kind: "widen-search" },
  });
  // In "All blocks" there is nowhere wider to look.
  expect(
    describeEmpty({
      filter: "mapped",
      canWiden: false,
      outcome: { kind: "elsewhere", count: 3 },
    }).action,
  ).toBeUndefined();
  expect(
    describeEmpty({ ...none, outcome: { kind: "hidden", count: 1 } }),
  ).toMatchObject({
    detail: "1 match in this block",
    action: { kind: "show-mapped" },
  });
  expect(describeEmpty({ ...none, outcome: { kind: "absent" } }).title).toBe(
    "Not in this font",
  );
});

it("treats an empty Undrawn or Missing view as good news", () => {
  const search = { outcome: null, canWiden: false };
  expect(describeEmpty({ ...search, filter: "undrawn" }).title).toBe(
    "Nothing undrawn",
  );
  expect(describeEmpty({ ...search, filter: "missing" }).title).toBe(
    "Nothing missing",
  );
  expect(describeEmpty({ ...search, filter: "mapped" }).title).toBe(
    "Nothing to show",
  );
});
