import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByWorkspace } from "./workspaces.ts";

const it = (hostId: string, workspaceId: string | null) => ({ hostId, hostLabel: hostId, workspaceId, project: "app", workspace: workspaceId ?? "" }) as never;

test("agents group per host and workspace; waiting workspaces come first", () => {
  const rows = groupByWorkspace([it("h1", "w2"), it("h1", "w2"), it("h1", null)], [it("h1", "w1"), it("h2", "w1"), it("h1", "w2")]);
  assert.deepEqual(rows.map((r) => [r.key, r.waiting, r.running]), [["h1:w2", 2, 1], ["h1:w1", 0, 1], ["h2:w1", 0, 1]]);
});
