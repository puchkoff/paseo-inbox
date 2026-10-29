import { getPaseoClient, useHosts } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useState } from "react";
import { type InboxItem, collectDone, collectInbox, sortInbox } from "../shared/inbox.ts";
import { type RunningItem, collectRunning, sortRunning } from "../shared/running.ts";

export interface InboxState {
  items: InboxItem[];
  // Empty unless useInbox was asked for it.
  running: RunningItem[];
  // Finished agents, newest first. Empty unless asked for, like running.
  done: InboxItem[];
  // Hosts that could not be read right now, e.g. "oleg: offline".
  problems: string[];
  loaded: boolean;
}

const HOST_TIMEOUT_MS = 8000;

// Plain polling over every configured host. getPaseoClient borrows the app's own connection,
// so the plugin does not need to be installed on the other daemons for them to show up.
export function useInbox(pollMs: number, withRunning = false): InboxState & { refresh: () => Promise<void> } {
  const hosts = useHosts();
  const [state, setState] = useState<InboxState>({ items: [], running: [], done: [], problems: [], loaded: false });
  const hostsKey = hosts.map((h) => `${h.serverId}:${h.status}`).join(",");

  const refresh = useCallback(async () => {
    // A request the app never answers must not keep every other host on "Loading…".
    const results = await Promise.all(
      hosts.map(async (h) => {
        const none = { items: [] as InboxItem[], running: [] as RunningItem[], done: [] as InboxItem[] };
        if (h.status !== "online") return { ...none, problem: `${h.label}: ${h.status}` };
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("no answer")), HOST_TIMEOUT_MS);
          });
          const paseo = getPaseoClient(h.serverId);
          const [inbox, running, done] = await Promise.race([
            Promise.all([
              collectInbox(paseo),
              withRunning ? collectRunning(paseo) : Promise.resolve([]),
              withRunning ? collectDone(paseo) : Promise.resolve([]),
            ]),
            timeout,
          ]);
          const host = { hostId: h.serverId, hostLabel: h.label };
          return {
            items: inbox.map((i) => ({ ...i, ...host, key: `${h.serverId}:${i.key}` })),
            running: running.map((i) => ({ ...i, ...host, key: `${h.serverId}:${i.key}` })),
            done: done.map((i) => ({ ...i, ...host, key: `${h.serverId}:${i.key}` })),
            problem: null,
          };
        } catch (e) {
          return { ...none, problem: `${h.label}: ${e instanceof Error ? e.message : String(e)}` };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    setState({
      items: sortInbox(results.flatMap((r) => r.items)),
      running: sortRunning(results.flatMap((r) => r.running)),
      done: results.flatMap((r) => r.done).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
      problems: results.flatMap((r) => (r.problem ? [r.problem] : [])),
      loaded: true,
    });
    // hostsKey covers hosts; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsKey, withRunning]);

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
