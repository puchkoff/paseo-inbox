import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useHosts, useSettings } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { InboxItem } from "../shared/inbox.ts";
import { type Rule, rulesSettings } from "../shared/rules.ts";
import { answer, useInbox } from "./use-inbox.ts";

// One scale for the whole screen (+25% over the first 26/17/15/13.5 scale).
const FS = { title: 32, body: 21, small: 19, tiny: 17 };

function age(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  return min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
}

type Tone = "ok" | "bad" | "pri" | "plain";

function Btn({ theme, label, tone = "plain", disabled, onPress }: {
  theme: PluginTheme; label: string; tone?: Tone; disabled?: boolean; onPress: () => void;
}) {
  const bg = { ok: theme.colors.statusSuccess, bad: theme.colors.statusDanger, pri: theme.colors.accent, plain: theme.colors.surface2 }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: bg, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ color: tone === "plain" ? theme.colors.foreground : theme.colors.accentForeground, fontSize: FS.small }}>{label}</Text>
    </Pressable>
  );
}

function Tag({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: `${color}26` }}>
      <Text style={{ color, fontSize: FS.tiny, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

interface CardProps {
  theme: PluginTheme;
  item: InboxItem;
  rulesReady: boolean;
  // Rules live on the host this screen is open on; an item from another host can't save one here.
  rulesHere: boolean;
  busy: boolean;
  onAnswer: (item: InboxItem, behavior: "allow" | "deny", opts?: { actionId?: string; always?: boolean }) => void;
  onOpen?: (item: InboxItem) => void;
}

function Card({ theme, item, rulesReady, rulesHere, busy, onAnswer, onOpen }: CardProps) {
  const [always, setAlways] = useState(false);
  const req = item.request;
  const c = theme.colors;
  const tag =
    item.reason === "permission" ? { color: c.statusWarning, label: req?.kind ?? "permission" }
    : item.reason === "error" ? { color: c.statusDanger, label: "error" }
    : { color: c.statusSuccess, label: "finished" };
  const canAlways = !!req && req.kind === "tool" && !!req.command && !req.risky && !!item.projectId && rulesReady && rulesHere;
  const customActions = req?.actions ?? [];

  return (
    <View style={{ backgroundColor: c.surface1, borderColor: req?.risky ? c.statusDanger : c.border, borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Tag {...tag} />
        <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600" }}>{item.title}</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: FS.small, flex: 1 }} numberOfLines={1}>
          {[item.hostLabel, item.provider, item.project, item.workspace].filter(Boolean).join(" · ")}
        </Text>
        <Text style={{ color: c.foregroundMuted, fontSize: FS.small }}>{age(item.at)}</Text>
      </View>

      {req ? (
        <View style={{ gap: 6 }}>
          {req.kind !== "tool" || !req.command ? <Text style={{ color: c.foreground, fontSize: FS.body }}>{req.title}</Text> : null}
          {req.body ? (
            <View style={{ backgroundColor: c.surface0, borderRadius: 8, padding: 10 }}>
              <Text selectable style={{ color: c.foreground, fontFamily: "monospace", fontSize: FS.small }}>{req.body}</Text>
            </View>
          ) : null}
          {req.risky && rulesHere ? (
            <Text style={{ color: c.statusDanger, fontSize: FS.small }}>Matches a destructive pattern. "Always allow" is off for this command.</Text>
          ) : null}
        </View>
      ) : item.reason === "error" ? (
        <Text style={{ color: c.foregroundMuted, fontSize: FS.body }}>The agent stopped with an error.</Text>
      ) : (
        <Text style={{ color: c.foregroundMuted, fontSize: FS.body }}>The agent finished and is waiting for you.</Text>
      )}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {req && customActions.length > 0
          ? customActions.map((a) => (
              <Btn key={a.id} theme={theme} label={a.label} tone={a.behavior === "allow" ? "ok" : "bad"} disabled={busy}
                onPress={() => onAnswer(item, a.behavior, { actionId: a.id })} />
            ))
          : req ? (
            <>
              <Btn theme={theme} label="Allow once" tone="ok" disabled={busy} onPress={() => onAnswer(item, "allow", { always })} />
              <Btn theme={theme} label="Deny" tone="bad" disabled={busy} onPress={() => onAnswer(item, "deny")} />
            </>
          ) : null}
        {onOpen ? <Btn theme={theme} label="Open agent" tone={req ? "plain" : "pri"} onPress={() => onOpen(item)} /> : null}
        {req && customActions.length === 0 && req.kind === "tool" ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: always, disabled: !canAlways }}
            disabled={!canAlways}
            onPress={() => setAlways(!always)}
            style={{ marginLeft: "auto", opacity: canAlways ? 1 : 0.4 }}
          >
            <Text style={{ color: c.foregroundMuted, fontSize: FS.small }}>
              {rulesHere
                ? `${always ? "☑" : "☐"} Always allow this exact command in ${item.project || "this project"}`
                : `Rules are per daemon: open Inbox on ${item.hostLabel} to add one`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Rules({ theme, hostLabel }: { theme: PluginTheme; hostLabel: string }) {
  const settings = useSettings(rulesSettings);
  const c = theme.colors;
  if (settings.status === "loading") return <Text style={{ color: c.foregroundMuted, fontSize: FS.body }}>Loading…</Text>;
  if (settings.status !== "ready") return <Text style={{ color: c.statusDanger, fontSize: FS.body }}>Rules unavailable.</Text>;
  const rules = settings.values.rules;
  const remove = (r: Rule) => settings.save({ rules: rules.filter((x) => x.id !== r.id) }, settings.revision);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.foregroundMuted, fontSize: FS.small }}>
        Rules on {hostLabel}. They answer tool permission requests there and match the exact command in one project, never a pattern. Destructive commands are never auto-allowed.
      </Text>
      {rules.length === 0 ? <Text style={{ color: c.foregroundMuted, paddingVertical: 24, textAlign: "center", fontSize: FS.body }}>No rules yet. Tick "Always allow" on a request to add one.</Text> : null}
      {rules.map((r) => (
        <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface1, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ color: r.action === "deny" ? c.statusDanger : c.foreground, fontFamily: "monospace", fontSize: FS.small }}>{r.command}</Text>
            <Text style={{ color: c.foregroundMuted, fontSize: FS.small }}>{r.action} · {r.projectName}</Text>
          </View>
          <Btn theme={theme} label="Remove" onPress={() => void remove(r)} />
        </View>
      ))}
    </View>
  );
}

export function InboxScreen({ theme, host, layout, navigation }: PluginScreenProps) {
  const c = theme.colors;
  const settings = useSettings(rulesSettings);
  const toast = useToast();
  const [tab, setTab] = useState<"queue" | "rules">("queue");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { items: allItems, problems, loaded, refresh } = useInbox(2000);
  const hosts = useHosts();
  // Opens on the daemon selected in the app; the app remounts the screen when that selection changes.
  const [chosen, setChosen] = useState(host.id);
  const scope = chosen === "all" || hosts.some((h) => h.serverId === chosen) ? chosen : "all";
  const items = scope === "all" ? allItems : allItems.filter((i) => i.hostId === scope);
  const countOn = (id: string) => allItems.filter((i) => i.hostId === id).length;

  async function respond(item: InboxItem, behavior: "allow" | "deny", opts?: { actionId?: string; always?: boolean }) {
    setBusyKey(item.key);
    try {
      if (opts?.always && item.request?.command && item.projectId && settings.status === "ready") {
        const rule: Rule = {
          id: `${Date.now()}`, action: "allow", command: item.request.command,
          projectId: item.projectId, projectName: item.project, createdAt: new Date().toISOString(),
        };
        if (!(await settings.save({ rules: [...settings.values.rules, rule] }, settings.revision))) {
          throw new Error("Could not save the rule");
        }
      }
      await answer(item, behavior, opts?.actionId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
      void refresh();
    }
  }

  const openAgent = navigation ? (item: InboxItem) => navigation.openAgent({ agentId: item.agentId, serverId: item.hostId }) : undefined;
  const pending = items.filter((i) => i.reason === "permission").length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 12, maxWidth: 860, width: "100%", alignSelf: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: c.foreground, fontSize: FS.title, fontWeight: "600", flex: 1 }}>
          Inbox <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{items.length ? `${items.length} waiting on you` : "all clear"}</Text>
        </Text>
        <Btn theme={theme} label="Queue" tone={tab === "queue" ? "pri" : "plain"} onPress={() => setTab("queue")} />
        <Btn theme={theme} label="Auto-rules" tone={tab === "rules" ? "pri" : "plain"} onPress={() => setTab("rules")} />
      </View>

      {hosts.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Btn theme={theme} label={`All hosts (${allItems.length})`} tone={scope === "all" ? "pri" : "plain"} onPress={() => setChosen("all")} />
          {hosts.map((h) => (
            <Btn key={h.serverId} theme={theme} label={`${h.label} (${countOn(h.serverId)})`} tone={scope === h.serverId ? "pri" : "plain"} onPress={() => setChosen(h.serverId)} />
          ))}
        </View>
      ) : null}

      {problems.length > 0 ? <Text style={{ color: c.statusWarning, fontSize: FS.small }}>Not shown: {problems.join(" · ")}</Text> : null}

      {tab === "rules" ? <Rules theme={theme} hostLabel={host.label} /> : items.length === 0 ? (
        <Text style={{ color: c.foregroundMuted, textAlign: "center", fontSize: FS.body, paddingVertical: 60 }}>{loaded ? "Nothing waiting on you." : "Loading…"}</Text>
      ) : (
        <>
          {pending > 0 ? <Text style={{ color: c.foregroundMuted, fontSize: FS.small }}>{pending} permission request{pending === 1 ? "" : "s"}, oldest first</Text> : null}
          {items.map((item) => (
            <Card key={item.key} theme={theme} item={item} rulesReady={settings.status === "ready"} rulesHere={item.hostId === host.id}
              busy={busyKey === item.key} onAnswer={(it, behavior, opts) => void respond(it, behavior, opts)} onOpen={openAgent} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
