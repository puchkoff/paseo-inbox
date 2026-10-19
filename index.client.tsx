import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { InboxScreen } from "./client/inbox.tsx";
import { useInbox } from "./client/use-inbox.ts";

function InboxItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const waiting = useInbox(5000).items.length;
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
