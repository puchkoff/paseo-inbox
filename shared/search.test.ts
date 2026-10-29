import assert from "node:assert/strict";
import { test } from "node:test";
import { matches } from "./search.ts";

const item = { title: "Fix Login bug", project: "web-app", workspace: "auth", hostLabel: "big-boy-4-oleg", provider: "claude" };

test("every word must match some field, case-insensitive", () => {
  assert.ok(matches(item, ""));
  assert.ok(matches(item, "login"));
  assert.ok(matches(item, "LOGIN web"));
  assert.ok(matches(item, "oleg auth"));
  assert.ok(!matches(item, "login payments"));
});
