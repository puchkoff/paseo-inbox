import type { InboxItem } from "./inbox.ts";
import type { RunningItem } from "./running.ts";

export interface WorkspaceRow {
  key: string;
  hostId: string;
  hostLabel: string;
  workspaceId: string;
  project: string;
  workspace: string;
  waiting: number;
  running: number;
}

// One row per host + workspace, waiting first. Agents without a workspace have nothing to open, so they are skipped.
export function groupByWorkspace(items: InboxItem[], running: RunningItem[]): WorkspaceRow[] {
  const rows = new Map<string, WorkspaceRow>();
  const add = (i: InboxItem | RunningItem, field: "waiting" | "running") => {
    if (!i.workspaceId) return;
    const key = `${i.hostId}:${i.workspaceId}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, hostId: i.hostId, hostLabel: i.hostLabel, workspaceId: i.workspaceId, project: i.project, workspace: i.workspace, waiting: 0, running: 0 };
      rows.set(key, row);
    }
    row[field]++;
  };
  for (const i of items) add(i, "waiting");
  for (const i of running) add(i, "running");
  return [...rows.values()].sort((a, b) => b.waiting - a.waiting || b.running - a.running || a.project.localeCompare(b.project));
}
