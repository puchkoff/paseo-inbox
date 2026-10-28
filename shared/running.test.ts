import assert from "node:assert/strict";
import { test } from "node:test";
import { collectRunning, sortRunning } from "./running.ts";

const agent = (over: Record<string, unknown>) => ({
  id: "a1", status: "running", title: "T", provider: "claude", model: "opus", workspaceId: "w1", updatedAt: "2026-01-01T00:10:00Z",
  lastUserMessageAt: "2026-01-01T00:00:00Z", activeTurn: null, pendingPermissions: [], archivedAt: null, ...over,
});
const fakeApi = (agents: unknown[]) =>
  ({
    agents: { list: async () => ({ entries: agents.map((agent) => ({ agent })) }) },
    workspaces: { list: async () => ({ entries: [{ id: "w1", projectId: "p1", projectDisplayName: "app", name: "main", status: "idle" }, { id: "w2", projectId: "p1", projectDisplayName: "app", name: "bg", status: "running" }] }) },
  }) as never;

test("running agents are listed with project, start time and the needs-you flag", async () => {
  const items = await collectRunning(fakeApi([
    agent({ id: "a", activeTurn: { turnId: "t", startedAt: "2026-01-01T00:05:00Z" } }),
    agent({ id: "b", pendingPermissions: [{ id: "r" }] }),
  ]));
  assert.equal(items[0]?.startedAt, "2026-01-01T00:05:00Z");
  assert.equal(items[1]?.startedAt, "2026-01-01T00:00:00Z");
  assert.deepEqual(items.map((i) => [i.project, i.needsYou]), [["app", false], ["app", true]]);
});

test("archived agents and agents in an archived workspace are skipped", async () => {
  const items = await collectRunning(fakeApi([
    agent({ id: "arch", archivedAt: "2026-01-01T00:00:00Z" }),
    agent({ id: "orphan", workspaceId: "gone" }),
    agent({ id: "ok" }),
  ]));
  assert.deepEqual(items.map((i) => i.agentId), ["ok"]);
});

test("an idle agent in a working workspace is listed as background; a running one is not duplicated", async () => {
  const items = await collectRunning(fakeApi([
    agent({ id: "old", status: "idle", workspaceId: "w2", updatedAt: "2026-01-01T00:01:00Z" }),
    agent({ id: "new", status: "idle", workspaceId: "w2", updatedAt: "2026-01-01T00:02:00Z" }),
    agent({ id: "quiet", status: "idle", workspaceId: "w1" }),
  ]));
  assert.deepEqual(items.map((i) => [i.agentId, i.background]), [["new", true]]);
  const both = await collectRunning(fakeApi([agent({ id: "r", workspaceId: "w2" }), agent({ id: "i", status: "idle", workspaceId: "w2" })]));
  assert.deepEqual(both.map((i) => [i.agentId, i.background]), [["r", false]]);
});

test("sort: longest-running first", () => {
  const r = sortRunning([{ startedAt: "3" }, { startedAt: "1" }, { startedAt: "2" }]);
  assert.deepEqual(r.map((i) => i.startedAt), ["1", "2", "3"]);
});
