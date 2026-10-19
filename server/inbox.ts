import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { InboxItem } from "../shared/rpc.ts";
import { commandOf, isDestructive } from "../shared/rules.ts";

type Paseo = PluginHandlerContext["paseo"];

const BODY_MAX = 1500;

export interface WorkspaceInfo {
  projectId: string;
  project: string;
  workspace: string;
}

export async function workspaceIndex(paseo: Paseo): Promise<Map<string, WorkspaceInfo>> {
  const { entries } = await paseo.workspaces.list();
  return new Map(
    entries.map((w) => [w.id, { projectId: w.projectId, project: w.projectDisplayName, workspace: w.name }]),
  );
}

function bodyOf(input: Record<string, unknown> | undefined, description: string | undefined): string {
  const text = description ?? (input ? JSON.stringify(input, null, 2) : "");
  return text.length > BODY_MAX ? `${text.slice(0, BODY_MAX)}…` : text;
}

export async function listInbox(_input: unknown, { paseo }: PluginHandlerContext) {
  // A running agent blocked on a permission is not flagged requiresAttention, so query running agents too.
  const [attention, running, workspaces] = await Promise.all([
    paseo.agents.list({ filter: { requiresAttention: true, includeArchived: false }, page: { limit: 200 } }),
    paseo.agents.list({ filter: { statuses: ["running"], includeArchived: false }, page: { limit: 200 } }),
    workspaceIndex(paseo),
  ]);
  const entries = [...new Map([...attention.entries, ...running.entries].map((e) => [e.agent.id, e])).values()];

  const items: InboxItem[] = [];
  for (const { agent } of entries) {
    const ws = agent.workspaceId ? workspaces.get(agent.workspaceId) : undefined;
    const base = {
      agentId: agent.id,
      title: agent.title ?? agent.id.slice(0, 8),
      provider: agent.provider,
      projectId: ws?.projectId ?? null,
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

  // Longest-waiting permission first, then the newest finished/error.
  const rank = (i: InboxItem) => (i.reason === "permission" ? 0 : i.reason === "error" ? 1 : 2);
  items.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const d = (a.at ?? "").localeCompare(b.at ?? "");
    return a.reason === "permission" ? d : -d;
  });
  return { items };
}

export async function answerRequest(
  input: { agentId: string; requestId: string; behavior: "allow" | "deny"; selectedActionId?: string },
  { paseo }: PluginHandlerContext,
) {
  try {
    const { agentId, requestId, behavior, selectedActionId } = input;
    const response =
      behavior === "allow"
        ? { behavior, ...(selectedActionId ? { selectedActionId } : {}) }
        : { behavior, message: "Denied from Inbox", ...(selectedActionId ? { selectedActionId } : {}) };
    await paseo.agents.ref(agentId).respondToPermission({ requestId, response });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
