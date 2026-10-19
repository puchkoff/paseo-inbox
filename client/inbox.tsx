import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type InboxItem, answerRequest, listInbox } from "../shared/rpc.ts";
import { type Rule, rulesSettings } from "../shared/rules.ts";

export const INBOX_KEY = "paseo-inbox";

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
      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: bg, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ color: tone === "plain" ? theme.colors.foreground : theme.colors.accentForeground, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function Tag({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: `${color}26` }}>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

interface CardProps {
  theme: PluginTheme;
  item: InboxItem;
  rulesReady: boolean;
  busy: boolean;
  onAnswer: (item: InboxItem, behavior: "allow" | "deny", opts?: { actionId?: string; always?: boolean }) => void;
  onOpen?: (item: InboxItem) => void;
}

function Card({ theme, item, rulesReady, busy, onAnswer, onOpen }: CardProps) {
  const [always, setAlways] = useState(false);
  const req = item.request;
  const c = theme.colors;
  const tag =
    item.reason === "permission" ? { color: c.statusWarning, label: req?.kind ?? "permission" }
    : item.reason === "error" ? { color: c.statusDanger, label: "error" }
    : { color: c.statusSuccess, label: "finished" };
  const canAlways = !!req && req.kind === "tool" && !!req.command && !req.risky && !!item.projectId && rulesReady;
  const customActions = req?.actions ?? [];

  return (
    <View style={{ backgroundColor: c.surface1, borderColor: req?.risky ? c.statusDanger : c.border, borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Tag {...tag} />
        <Text style={{ color: c.foreground, fontWeight: "600" }}>{item.title}</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: 12, flex: 1 }} numberOfLines={1}>
          {[item.provider, item.project, item.workspace].filter(Boolean).join(" · ")}
        </Text>
        <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{age(item.at)}</Text>
      </View>

      {req ? (
        <View style={{ gap: 6 }}>
          {req.kind !== "tool" || !req.command ? <Text style={{ color: c.foreground }}>{req.title}</Text> : null}
          {req.body ? (
            <View style={{ backgroundColor: c.surface0, borderRadius: 8, padding: 10 }}>
              <Text selectable style={{ color: c.foreground, fontFamily: "monospace", fontSize: 12.5 }}>{req.body}</Text>
            </View>
          ) : null}
          {req.risky ? (
            <Text style={{ color: c.statusDanger, fontSize: 12.5 }}>Matches a destructive pattern. "Always allow" is off for this command.</Text>
          ) : null}
        </View>
      ) : item.reason === "error" ? (
        <Text style={{ color: c.foregroundMuted }}>The agent stopped with an error.</Text>
      ) : (
        <Text style={{ color: c.foregroundMuted }}>The agent finished and is waiting for you.</Text>
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
            <Text style={{ color: c.foregroundMuted, fontSize: 12.5 }}>
              {always ? "☑" : "☐"} Always allow this exact command in {item.project || "this project"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Rules({ theme }: { theme: PluginTheme }) {
  const settings = useSettings(rulesSettings);
  const c = theme.colors;
  if (settings.status === "loading") return <Text style={{ color: c.foregroundMuted }}>Loading…</Text>;
  if (settings.status !== "ready") return <Text style={{ color: c.statusDanger }}>Rules unavailable.</Text>;
  const rules = settings.values.rules;
  const remove = (r: Rule) => settings.save({ rules: rules.filter((x) => x.id !== r.id) }, settings.revision);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.foregroundMuted, fontSize: 12.5 }}>
        Rules answer tool permission requests. They match the exact command in one project, never a pattern. Destructive commands are never auto-allowed.
      </Text>
      {rules.length === 0 ? <Text style={{ color: c.foregroundMuted, paddingVertical: 24, textAlign: "center" }}>No rules yet. Tick "Always allow" on a request to add one.</Text> : null}
      {rules.map((r) => (
        <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface1, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text selectable style={{ color: r.action === "deny" ? c.statusDanger : c.foreground, fontFamily: "monospace", fontSize: 12.5 }}>{r.command}</Text>
            <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{r.action} · {r.projectName}</Text>
          </View>
          <Btn theme={theme} label="Remove" onPress={() => void remove(r)} />
        </View>
      ))}
    </View>
  );
}

export function InboxScreen({ theme, host, layout, navigation }: PluginScreenProps) {
  const c = theme.colors;
  const list = useRpc(listInbox);
  const answer = useRpc(answerRequest);
  const settings = useSettings(rulesSettings);
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"queue" | "rules">("queue");

  const query = useQuery({ queryKey: [INBOX_KEY, host.id], queryFn: () => list({}), refetchInterval: 2000 });
  const items = query.data?.items ?? [];

  const respond = useMutation({
    mutationFn: async (v: { item: InboxItem; behavior: "allow" | "deny"; actionId?: string; always?: boolean }) => {
      const { item, behavior, actionId, always } = v;
      if (always && item.request?.command && item.projectId && settings.status === "ready") {
        const rule: Rule = {
          id: `${Date.now()}`, action: "allow", command: item.request.command,
          projectId: item.projectId, projectName: item.project, createdAt: new Date().toISOString(),
        };
        if (!(await settings.save({ rules: [...settings.values.rules, rule] }, settings.revision))) {
          throw new Error("Could not save the rule");
        }
      }
      const res = await answer({ agentId: item.agentId, requestId: item.request?.id ?? "", behavior, selectedActionId: actionId });
      if (!res.ok) throw new Error(res.error ?? "Answer failed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: [INBOX_KEY, host.id] }),
  });

  const openAgent = navigation ? (item: InboxItem) => navigation.openAgent({ agentId: item.agentId, serverId: host.id }) : undefined;
  const pending = items.filter((i) => i.reason === "permission").length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 12, maxWidth: 860, width: "100%", alignSelf: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "600", flex: 1 }}>
          Inbox <Text style={{ color: c.foregroundMuted, fontSize: 13, fontWeight: "400" }}>{items.length ? `${items.length} waiting on you` : "all clear"}</Text>
        </Text>
        <Btn theme={theme} label="Queue" tone={tab === "queue" ? "pri" : "plain"} onPress={() => setTab("queue")} />
        <Btn theme={theme} label="Auto-rules" tone={tab === "rules" ? "pri" : "plain"} onPress={() => setTab("rules")} />
      </View>

      {tab === "rules" ? <Rules theme={theme} /> : query.isError ? (
        <Text style={{ color: c.statusDanger }}>Could not load the inbox: {query.error instanceof Error ? query.error.message : "unknown error"}</Text>
      ) : items.length === 0 ? (
        <Text style={{ color: c.foregroundMuted, textAlign: "center", paddingVertical: 60 }}>{query.isLoading ? "Loading…" : "Nothing waiting on you."}</Text>
      ) : (
        <>
          {pending > 0 ? <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{pending} permission request{pending === 1 ? "" : "s"}, oldest first</Text> : null}
          {items.map((item) => (
            <Card key={item.key} theme={theme} item={item} rulesReady={settings.status === "ready"}
              busy={respond.isPending && respond.variables?.item.key === item.key}
              onAnswer={(it, behavior, opts) => respond.mutate({ item: it, behavior, ...opts })} onOpen={openAgent} />
          ))}
        </>
      )}
    </ScrollView>
  );
}
