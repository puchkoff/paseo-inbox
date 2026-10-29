import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { InboxScreen } from "./client/inbox.tsx";
import { useInbox } from "./client/use-inbox.ts";

function Badge({ count, icon, label, color, fg }: { count: number; icon: string; label: string; color: string; fg: string }) {
  if (count === 0) return null;
  return (
    <View accessibilityLabel={`${count} ${label}`} style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: color, borderRadius: 999, paddingHorizontal: 7 }}>
      <Icon name={icon} size={12} color={fg} />
      <Text style={{ color: fg, fontSize: 13, fontWeight: "700" }}>{count}</Text>
    </View>
  );
}

function InboxItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const { items, running } = useInbox(5000, true);
  // Same rules as the screen: finished agents are Done, not waiting; an agent waiting on a permission counts as waiting, not running.
  const waiting = items.filter((i) => i.reason !== "finished").length;
  const working = running.filter((i) => !i.needsYou).length;
  const c = theme.colors;
  return (
    <SidebarRow
      icon="Inbox"
      active={currentScreen?.screenId === "inbox"}
      onPress={() => openScreen({ screenId: "inbox" })}
      trailing={waiting > 0 || working > 0 ? (
        <View style={{ flexDirection: "row", gap: 4, marginRight: 8 }}>
          <Badge count={waiting} icon="Hourglass" label="waiting on you" color={c.statusWarning} fg={c.accentForeground} />
          <Badge count={working} icon="Activity" label="running" color={c.accent} fg={c.accentForeground} />
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
