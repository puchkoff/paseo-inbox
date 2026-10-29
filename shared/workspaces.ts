export interface WorkspaceRow {
  key: string;
  hostId: string;
  hostLabel: string;
  // null: the workspace is archived, so there is nothing to open.
  workspaceId: string | null;
  project: string;
  workspace: string;
  agents: number;
}

type Groupable = { hostId: string; hostLabel: string; workspaceId: string | null; project: string; workspace: string };

// One row per host + workspace, in the order the list already has. Agents of an archived workspace
// (workspaceId null) group by their workspace name; with no name either there is nothing to show.
export function groupByWorkspace(list: Groupable[]): WorkspaceRow[] {
  const rows = new Map<string, WorkspaceRow>();
  for (const i of list) {
    const id = i.workspaceId ?? (i.workspace ? `name:${i.workspace}` : null);
    if (!id) continue;
    const key = `${i.hostId}:${id}`;
    const row = rows.get(key);
    if (row) row.agents++;
    else rows.set(key, { key, hostId: i.hostId, hostLabel: i.hostLabel, workspaceId: i.workspaceId, project: i.project, workspace: i.workspace, agents: 1 });
  }
  return [...rows.values()];
}
