import assert from "node:assert/strict";
import { test } from "node:test";
import { collectInbox, sortInbox } from "./inbox.ts";

const agent = (over: Record<string, unknown>) => ({
  id: "a1", title: "T", provider: "claude", workspaceId: "w1", updatedAt: "2026-01-01T00:00:00Z",
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

test("sort: permissions oldest first, then errors, then newest finished", () => {
  const it = (reason: "permission" | "error" | "finished", at: string) => ({ reason, at });
  const r = sortInbox([it("finished", "1"), it("permission", "3"), it("finished", "2"), it("error", "1"), it("permission", "2")]);
  assert.deepEqual(r.map((i) => `${i.reason}${i.at}`), ["permission2", "permission3", "error1", "finished2", "finished1"]);
});
