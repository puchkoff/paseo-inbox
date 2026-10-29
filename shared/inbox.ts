import type { PaseoApi } from "@getpaseo/client";
import { commandOf, isDestructive } from "./rules.ts";

const BODY_MAX = 1500;

export interface InboxItem {
  key: string;
  hostId: string;
  hostLabel: string;
  agentId: string;
  title: string;
  provider: string;
  projectId: string | null;
  workspaceId: string | null;
  project: string;
  workspace: string;
  at: string | null;
  reason: "permission" | "finished" | "error" | "archived";
  request: {
    id: string;
    kind: "tool" | "plan" | "question" | "mode" | "other";
    title: string;
    body: string;
    command: string | null;
    risky: boolean;
    actions: { id: string; label: string; behavior: "allow" | "deny" }[];
  } | null;
}

export interface WorkspaceInfo {
  projectId: string;
  project: string;
  workspace: string;
}

export async function workspaceIndex(paseo: PaseoApi): Promise<Map<string, WorkspaceInfo>> {
  const { entries } = await paseo.workspaces.list();
  return new Map(
    entries.map((w) => [w.id, { projectId: w.projectId, project: w.projectDisplayName, workspace: w.name }]),
  );
}

function bodyOf(input: Record<string, unknown> | undefined, description: string | undefined): string {
  const text = description ?? (input ? JSON.stringify(input, null, 2) : "");
  return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX)}…` : text;
}

// One host's items. The caller stamps hostId/hostLabel and prefixes the key.
export async function collectInbox(paseo: PaseoApi): Promise<Omit<InboxItem, "hostId" | "hostLabel">[]> {
  // A running agent blocked on a permission is not flagged requiresAttention, so query running agents too.
  const [attention, running, workspaces] = await Promise.all([
    paseo.agents.list({ filter: { requiresAttention: true, includeArchived: false }, page: { limit: 200 } }),
    paseo.agents.list({ filter: { statuses: ["running"], includeArchived: false }, page: { limit: 200 } }),
    workspaceIndex(paseo),
  ]);
  const entries = [...new Map([...attention.entries, ...running.entries].map((e) => [e.agent.id, e])).values()];

  const items: Omit<InboxItem, "hostId" | "hostLabel">[] = [];
  for (const { agent } of entries) {
    const ws = agent.workspaceId ? workspaces.get(agent.workspaceId) : undefined;
    // An agent in an archived workspace is not archived itself (archivedAt stays null) but is closed;
    // the sidebar hides it, so the inbox must too.
    if (agent.status === "closed" || agent.archivedAt || (agent.workspaceId && !ws)) continue;
    const base = {
      agentId: agent.id,
      title: agent.title ?? agent.id.slice(0, 8),
      provider: agent.provider,
      projectId: ws?.projectId ?? null,
      workspaceId: agent.workspaceId ?? null,
      project: ws?.project ?? "",
      workspace: ws?.workspace ?? "",
      at: agent.attentionTimestamp ?? (agent.pendingPermissions.length > 0 ? agent.updatedAt : null),
    };
    if (agent.pendingPermissions.length > 0) {
      for (const req of agent.pendingPermissions) {
        const command = commandOf(req.input);
        items.push({
          ...base,
          key: `${agent.id}:${req.id}`,
          reason: "permission",
          request: {
            id: req.id,
            kind: req.kind,
            title: req.title ?? req.name,
            body: command ?? bodyOf(req.input, req.description),
            command,
            risky: command !== null && isDestructive(command),
            actions: (req.actions ?? []).map((a) => ({ id: a.id, label: a.label, behavior: a.behavior })),
          },
        });
      }
    } else if (agent.attentionReason === "finished" || agent.attentionReason === "error") {
      items.push({ ...base, key: `${agent.id}:attention`, reason: agent.attentionReason, request: null });
    }
  }
  return items;
}

const DONE_MAX = 15;
const DONE_WINDOW_MS = 24 * 3600_000;

// One host's agents whose turn ended in the last 24 h, newest first; agents waiting on a permission are left to collectInbox.
// shortcut: newest 15 per host, raise DONE_MAX if the list feels short.
export async function collectDone(paseo: PaseoApi, now = Date.now()): Promise<Omit<InboxItem, "hostId" | "hostLabel">[]> {
  const [{ entries }, workspaces] = await Promise.all([
    paseo.agents.list({ filter: { statuses: ["idle"], includeArchived: false }, page: { limit: 200 } }),
    workspaceIndex(paseo),
  ]);
  return entries
    .map((e) => e.agent)
    .filter((a) => {
      const ws = a.workspaceId ? workspaces.get(a.workspaceId) : undefined;
      return !a.archivedAt && !(a.workspaceId && !ws) && a.pendingPermissions.length === 0
        && a.attentionReason !== "error" && now - Date.parse(a.updatedAt) < DONE_WINDOW_MS;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, DONE_MAX)
    .map((a) => {
      const ws = a.workspaceId ? workspaces.get(a.workspaceId) : undefined;
      return {
        key: `${a.id}:done`, agentId: a.id, title: a.title ?? a.id.slice(0, 8), provider: a.provider,
        projectId: ws?.projectId ?? null, workspaceId: a.workspaceId ?? null, project: ws?.project ?? "", workspace: ws?.workspace ?? "",
        at: a.updatedAt, reason: "finished" as const, request: null,
      };
    });
}

const ARCHIVE_PAGE = 50;
const ARCHIVE_WANT = 20;

// One host's archived agents, newest first, from `cursor` on. The API has no archived-only filter, so this pages
// through every agent until it has ARCHIVE_WANT archived ones; cursor is null once the host has no more.
// An agent in an archived workspace counts as archived (its archivedAt stays null).
export async function collectArchive(paseo: PaseoApi, cursor?: string): Promise<{ items: Omit<InboxItem, "hostId" | "hostLabel">[]; cursor: string | null }> {
  const workspaces = await workspaceIndex(paseo);
  const items: Omit<InboxItem, "hostId" | "hostLabel">[] = [];
  let next: string | null = cursor ?? null;
  do {
    const page = await paseo.agents.list({
      filter: { includeArchived: true },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: ARCHIVE_PAGE, ...(next ? { cursor: next } : {}) },
    });
    for (const { agent: a } of page.entries) {
      const ws = a.workspaceId ? workspaces.get(a.workspaceId) : undefined;
      if (!a.archivedAt && !(a.workspaceId && !ws)) continue;
      items.push({
        key: `${a.id}:archived`, agentId: a.id, title: a.title ?? a.id.slice(0, 8), provider: a.provider,
        projectId: ws?.projectId ?? null, workspaceId: ws ? a.workspaceId ?? null : null, project: ws?.project ?? "", workspace: ws?.workspace ?? "",
        at: a.archivedAt ?? a.updatedAt, reason: "archived", request: null,
      });
    }
    next = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? null : null;
  } while (next && items.length < ARCHIVE_WANT);
  return { items, cursor: next };
}

// Longest-waiting permission first, then errors, then the newest finished.
export function sortInbox<T extends Pick<InboxItem, "reason" | "at">>(items: T[]): T[] {
  const rank = (i: T) => (i.reason === "permission" ? 0 : i.reason === "error" ? 1 : 2);
  return items.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const d = (a.at ?? "").localeCompare(b.at ?? "");
    return a.reason === "permission" ? d : -d;
  });
}
