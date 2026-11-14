export interface WorkspaceRow<T = Groupable> {
  key: string;
  hostId: string;
  hostLabel: string;
  // null: the workspace is archived, so there is nothing to open.
  workspaceId: string | null;
  project: string;
  workspace: string;
  agents: T[];
}

type Groupable = { hostId: string; hostLabel: string; workspaceId: string | null; project: string; workspace: string };

// One row per host + workspace, in the order the list already has. Agents of an archived workspace
// (workspaceId null) group by their workspace name; with no name either there is nothing to show.
export function groupByWorkspace<T extends Groupable>(list: T[]): WorkspaceRow<T>[] {
  const rows = new Map<string, WorkspaceRow<T>>();
  for (const i of list) {
    const id = i.workspaceId ?? (i.workspace ? `name:${i.workspace}` : null);
    if (!id) continue;
    const key = `${i.hostId}:${id}`;
    const row = rows.get(key);
    if (row) row.agents.push(i);
    else rows.set(key, { key, hostId: i.hostId, hostLabel: i.hostLabel, workspaceId: i.workspaceId, project: i.project, workspace: i.workspace, agents: [i] });
  }
  return [...rows.values()];
}
