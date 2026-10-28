import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { InboxScreen } from "./client/inbox.tsx";
import { useInbox } from "./client/use-inbox.ts";

function Badge({ count, color, fg }: { count: number; color: string; fg: string }) {
  if (count === 0) return null;
  return (
    <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 7 }}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: "700" }}>{count}</Text>
    </View>
  );
}

function InboxItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const { items, running } = useInbox(5000, true);
  // Same rule as the screen: an agent waiting on a permission counts as waiting, not running.
  const working = running.filter((i) => !i.needsYou).length;
  const c = theme.colors;
  return (
    <SidebarRow
      icon="Inbox"
      active={currentScreen?.screenId === "inbox"}
      onPress={() => openScreen({ screenId: "inbox" })}
      trailing={items.length > 0 || working > 0 ? (
        <View style={{ flexDirection: "row", gap: 4, marginRight: 8 }}>
          <Badge count={items.length} color={c.statusWarning} fg={c.accentForeground} />
          <Badge count={working} color={c.accent} fg={c.accentForeground} />
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
