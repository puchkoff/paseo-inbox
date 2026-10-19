import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { InboxScreen } from "./client/inbox.tsx";
import { listInbox } from "./shared/rpc.ts";

// Plain polling: a sidebar item is not guaranteed a React Query client.
function useWaiting(): number {
  const list = useRpc(listInbox);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    const tick = () => list({}).then((r) => live && setN(r.items.length), () => {});
    void tick();
    const t = setInterval(tick, 5000);
    return () => { live = false; clearInterval(t); };
  }, [list]);
  return n;
}

function InboxItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const waiting = useWaiting();
  return (
    <SidebarRow
      icon="Inbox"
      active={currentScreen?.screenId === "inbox"}
      onPress={() => openScreen({ screenId: "inbox" })}
      trailing={waiting > 0 ? (
        <View style={{ backgroundColor: theme.colors.statusWarning, borderRadius: 999, paddingHorizontal: 7, marginRight: 8 }}>
          <Text style={{ color: theme.colors.accentForeground, fontSize: 11, fontWeight: "700" }}>{waiting}</Text>
        </View>
      ) : null}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "inbox", title: "Inbox", Component: InboxScreen });
  client.addSidebarHeaderItem({ id: "inbox", title: "Inbox", Component: InboxItem });
  return () => {};
}
