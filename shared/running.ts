import type { PaseoApi } from "@getpaseo/client";

export interface RunningItem {
  key: string;
  hostId: string;
  hostLabel: string;
  agentId: string;
  title: string;
  provider: string;
  model: string | null;
  workspaceId: string | null;
  project: string;
  workspace: string;
  startedAt: string;
  updatedAt: string;
  // Blocked on a permission: it is also in the Inbox.
  needsYou: boolean;
  // Parent turn is over but the workspace still counts as working (background subagents).
  background: boolean;
}

interface WorkspaceInfo {
  project: string;
  workspace: string;
  working: boolean;
}

async function workspaceIndex(paseo: PaseoApi): Promise<Map<string, WorkspaceInfo>> {
  const { entries } = await paseo.workspaces.list();
  return new Map(entries.map((w) => [w.id, { project: w.projectDisplayName, workspace: w.name, working: w.status === "running" }]));
}

// One host's running agents. The caller stamps hostId/hostLabel and prefixes the key.
// The sidebar's "Working" is workspace-level: a workspace stays working while background subagents
// run after the parent turn ended, and the public API cannot list those. So a working workspace with
// no running agent is shown through its latest agent (background: true).
export async function collectRunning(paseo: PaseoApi): Promise<Omit<RunningItem, "hostId" | "hostLabel">[]> {
  const [{ entries }, workspaces] = await Promise.all([
    paseo.agents.list({ filter: { statuses: ["running", "idle"], includeArchived: false }, page: { limit: 200 } }),
    workspaceIndex(paseo),
  ]);
  const items: Omit<RunningItem, "hostId" | "hostLabel">[] = [];
  const latestIdle = new Map<string, (typeof entries)[number]["agent"]>();
  const busy = new Set<string>();
  const toItem = (agent: (typeof entries)[number]["agent"], ws: WorkspaceInfo | undefined, background: boolean) => ({
    key: agent.id,
    agentId: agent.id,
    title: agent.title ?? agent.id.slice(0, 8),
    provider: agent.provider,
    model: agent.model,
    workspaceId: agent.workspaceId ?? null,
    project: ws?.project ?? "",
    workspace: ws?.workspace ?? "",
    startedAt: background ? agent.updatedAt : (agent.activeTurn?.startedAt ?? agent.lastUserMessageAt ?? agent.updatedAt),
    updatedAt: agent.updatedAt,
    needsYou: agent.pendingPermissions.length > 0,
    background,
  });
  for (const { agent } of entries) {
    const ws = agent.workspaceId ? workspaces.get(agent.workspaceId) : undefined;
    // Agents in an archived workspace keep archivedAt null; the sidebar hides them, so do we.
    if (agent.archivedAt || (agent.workspaceId && !ws)) continue;
    if (agent.status === "running") {
      items.push(toItem(agent, ws, false));
      if (agent.workspaceId) busy.add(agent.workspaceId);
    } else if (agent.workspaceId && ws?.working) {
      const prev = latestIdle.get(agent.workspaceId);
      if (!prev || agent.updatedAt > prev.updatedAt) latestIdle.set(agent.workspaceId, agent);
    }
  }
  for (const [workspaceId, agent] of latestIdle) {
    if (!busy.has(workspaceId)) items.push(toItem(agent, workspaces.get(workspaceId), true));
  }
  return items;
}

// Longest-running first.
export function sortRunning<T extends Pick<RunningItem, "startedAt">>(items: T[]): T[] {
  return items.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
