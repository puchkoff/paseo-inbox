import { getPaseoClient, useHosts } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useState } from "react";
import { type InboxItem, collectInbox, sortInbox } from "../shared/inbox.ts";

export interface InboxState {
  items: InboxItem[];
  // Hosts that could not be read right now, e.g. "oleg: offline".
  problems: string[];
  loaded: boolean;
}

// Plain polling over every configured host. getPaseoClient borrows the app's own connection,
// so the plugin does not need to be installed on the other daemons for them to show up.
export function useInbox(pollMs: number): InboxState & { refresh: () => Promise<void> } {
  const hosts = useHosts();
  const [state, setState] = useState<InboxState>({ items: [], problems: [], loaded: false });
  const hostsKey = hosts.map((h) => `${h.serverId}:${h.status}`).join(",");

  const refresh = useCallback(async () => {
    const results = await Promise.all(
      hosts.map(async (h) => {
        if (h.status !== "online") return { items: [] as InboxItem[], problem: `${h.label}: ${h.status}` };
        try {
          const items = (await collectInbox(getPaseoClient(h.serverId))).map((i) => ({
            ...i, hostId: h.serverId, hostLabel: h.label, key: `${h.serverId}:${i.key}`,
          }));
          return { items, problem: null };
        } catch (e) {
          return { items: [] as InboxItem[], problem: `${h.label}: ${e instanceof Error ? e.message : String(e)}` };
        }
      }),
    );
    setState({
      items: sortInbox(results.flatMap((r) => r.items)),
      problems: results.flatMap((r) => (r.problem ? [r.problem] : [])),
      loaded: true,
    });
    // hostsKey covers hosts; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsKey]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { ...state, refresh };
}

export async function answer(
  item: InboxItem,
  behavior: "allow" | "deny",
  selectedActionId?: string,
): Promise<void> {
  if (!item.request) throw new Error("Nothing to answer");
  const response =
    behavior === "allow"
      ? { behavior, ...(selectedActionId ? { selectedActionId } : {}) }
      : { behavior, message: "Denied from Inbox", ...(selectedActionId ? { selectedActionId } : {}) };
  await getPaseoClient(item.hostId).agents.ref(item.agentId).respondToPermission({ requestId: item.request.id, response });
}
