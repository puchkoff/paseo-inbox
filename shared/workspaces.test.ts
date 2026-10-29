import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByWorkspace } from "./workspaces.ts";

const it = (hostId: string, workspaceId: string | null, workspace = workspaceId ?? "") => ({ hostId, hostLabel: hostId, workspaceId, project: "app", workspace });

test("agents group per host and workspace in list order; archived workspaces group by name", () => {
  const rows = groupByWorkspace([it("h1", "w2"), it("h1", "w1"), it("h1", "w2"), it("h2", "w1"), it("h1", null, "old"), it("h1", null, "old"), it("h1", null)]);
  assert.deepEqual(rows.map((r) => [r.key, r.agents, r.workspaceId]), [["h1:w2", 2, "w2"], ["h1:w1", 1, "w1"], ["h2:w1", 1, "w1"], ["h1:name:old", 2, null]]);
});
