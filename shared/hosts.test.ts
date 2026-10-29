import assert from "node:assert/strict";
import { test } from "node:test";
import { initials } from "./hosts.ts";

test("host initials: first + last word, domain and digits skipped", () => {
  assert.deepEqual(
    ["big-boy-4-oleg", "big-boy-4-puchkoff", "Olegs-MacBook-Air.local", "devbox", "42"].map(initials),
    ["BO", "BP", "OA", "DE", "42"],
  );
});
