import assert from "node:assert/strict";
import { test } from "node:test";
import { collectArchive, collectDone, collectInbox, sortInbox } from "./inbox.ts";

const agent = (over: Record<string, unknown>) => ({
  id: "a1", title: "T", provider: "claude", workspaceId: "w1", cwd: "/home/u/old-app", updatedAt: "2026-01-01T00:00:00Z",
  pendingPermissions: [], attentionReason: null, attentionTimestamp: null, ...over,
});
const fakeApi = (attention: unknown[], running: unknown[]) =>
  ({
    agents: { list: async ({ filter }: { filter: { requiresAttention?: boolean } }) => ({ entries: (filter.requiresAttention ? attention : running).map((agent) => ({ agent })) }) },
    workspaces: { list: async () => ({ entries: [{ id: "w1", projectId: "p1", projectDisplayName: "app", name: "main" }] }) },
  }) as never;

const perm = { id: "r1", kind: "tool", name: "Bash", input: { command: "rm -rf build" } };

test("a running agent with a pending permission is listed once, even if it is in both queries", async () => {
  const a = agent({ pendingPermissions: [perm] });
  const items = await collectInbox(fakeApi([a], [a]));
  assert.equal(items.length, 1);
  assert.equal(items[0]?.reason, "permission");
  assert.equal(items[0]?.request?.command, "rm -rf build");
  assert.equal(items[0]?.request?.risky, true);
  assert.equal(items[0]?.project, "app");
  assert.equal(items[0]?.at, "2026-01-01T00:00:00Z");
});

test("finished and error agents become attention items; plain running agents are skipped", async () => {
  const items = await collectInbox(fakeApi(
    [agent({ id: "f", attentionReason: "finished" }), agent({ id: "e", attentionReason: "error" })],
    [agent({ id: "busy" })],
  ));
  assert.deepEqual(items.map((i) => i.reason).sort(), ["error", "finished"]);
});

test("agents that are closed or live in an archived workspace are skipped", async () => {
  const items = await collectInbox(fakeApi(
    [
      agent({ id: "closed", status: "closed", attentionReason: "finished" }),
      agent({ id: "orphan", workspaceId: "archived-ws", attentionReason: "finished" }),
      agent({ id: "ok", attentionReason: "finished" }),
    ],
    [],
  ));
  assert.deepEqual(items.map((i) => i.agentId), ["ok"]);
});

test("sort: permissions oldest first, then errors, then newest finished", () => {
  const it = (reason: "permission" | "error" | "finished", at: string) => ({ reason, at });
  const r = sortInbox([it("finished", "1"), it("permission", "3"), it("finished", "2"), it("error", "1"), it("permission", "2")]);
  assert.deepEqual(r.map((i) => `${i.reason}${i.at}`), ["permission2", "permission3", "error1", "finished2", "finished1"]);
});

test("done lists recent idle agents newest first, skipping old, errored, blocked and archived-workspace ones", async () => {
  const now = Date.parse("2026-01-02T12:00:00Z");
  const api = {
    agents: { list: async () => ({ entries: [
      agent({ id: "old", updatedAt: "2025-12-31T00:00:00Z" }),
      agent({ id: "a", updatedAt: "2026-01-02T10:00:00Z" }),
      agent({ id: "b", updatedAt: "2026-01-02T11:00:00Z" }),
      agent({ id: "err", updatedAt: "2026-01-02T11:00:00Z", attentionReason: "error" }),
      agent({ id: "blocked", updatedAt: "2026-01-02T11:00:00Z", pendingPermissions: [perm] }),
      agent({ id: "gone", updatedAt: "2026-01-02T11:00:00Z", workspaceId: "w9" }),
    ].map((a) => ({ agent: a })) }) },
    workspaces: { list: async () => ({ entries: [{ id: "w1", projectId: "p1", projectDisplayName: "app", name: "main" }] }) },
  } as never;
  assert.deepEqual((await collectDone(api, now)).map((i) => i.agentId), ["b", "a"]);
});

test("archive pages until it has archived agents and keeps the cursor for Load more", async () => {
  const pages = [
    { entries: [{ agent: agent({ id: "live" }) }, { agent: agent({ id: "arch", archivedAt: "2026-01-01T00:00:00Z" }) }], pageInfo: { hasMore: true, nextCursor: "c1" } },
    { entries: [{ agent: agent({ id: "inGoneWs", workspaceId: "w9" }) }], pageInfo: { hasMore: false, nextCursor: null } },
  ];
  const cursors: unknown[] = [];
  const api = {
    agents: { list: async ({ page }: { page: { cursor?: string } }) => { cursors.push(page.cursor); return pages[cursors.length - 1] ?? { entries: [], pageInfo: { hasMore: false } }; } },
    workspaces: { list: async () => ({ entries: [{ id: "w1", projectId: "p1", projectDisplayName: "app", name: "main" }] }) },
  } as never;
  const r = await collectArchive(api);
  assert.deepEqual(r.items.map((i) => [i.agentId, i.workspaceId, i.workspace]), [["arch", "w1", "main"], ["inGoneWs", null, "old-app"]]);
  assert.deepEqual(cursors, [undefined, "c1"]);
  assert.equal(r.cursor, null);
});
