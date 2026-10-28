import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useHosts, useSettings } from "@getpaseo/plugin/client";
import { Icon, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { InboxItem } from "../shared/inbox.ts";
import type { RunningItem } from "../shared/running.ts";
import { type Rule, rulesSettings } from "../shared/rules.ts";
import { answer, useInbox } from "./use-inbox.ts";

// One scale for the whole screen. 26/17/15/13.5 read too small, 29/19/17/15 too big.
const FS = { title: 27, body: 18, small: 16, tiny: 14 };

function age(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  return min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
}

const QUIET_MIN = 10;

function span(fromIso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(fromIso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  return min < 1440 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.round(min / 1440)} d`;
}

// Hairline design: fixed indigo so buttons stay readable on light and dark themes.
const INDIGO = "#6366f1";

// ok = filled primary, pri = outlined primary, bad = outlined danger, plain = quiet chip, on = selected chip.
type Tone = "ok" | "bad" | "pri" | "plain" | "on";

function Btn({ theme, label, tone = "plain", disabled, onPress }: {
  theme: PluginTheme; label: string; tone?: Tone; disabled?: boolean; onPress: () => void;
}) {
  const c = theme.colors;
  const look = {
    ok: { bg: INDIGO, fg: "#fff", border: INDIGO },
    pri: { bg: "transparent", fg: INDIGO, border: `${INDIGO}73` },
    bad: { bg: "transparent", fg: c.statusDanger, border: `${c.statusDanger}73` },
    plain: { bg: c.surface2, fg: c.foregroundMuted, border: "transparent" },
    on: { bg: c.foreground, fg: c.surface0, border: "transparent" },
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: look.border, backgroundColor: look.bg, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ color: look.fg, fontSize: FS.small }}>{label}</Text>
    </Pressable>
  );
}

function OpenButtons<T extends { hostId: string; workspaceId: string | null }>({ item, onOpen, onOpenWorkspace }: {
  item: T; onOpen?: (item: T) => void; onOpenWorkspace?: (workspaceId: string, hostId: string) => void;
}) {
  const ws = item.workspaceId;
  return (
    <>
      {onOpen ? <IconBtn icon="Bot" label="Open agent" onPress={() => onOpen(item)} /> : null}
      {onOpenWorkspace && ws ? <IconBtn icon="AppWindow" label="Open workspace" onPress={() => onOpenWorkspace(ws, item.hostId)} /> : null}
    </>
  );
}

// Square outlined icon button; label goes to screen readers.
function IconBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ padding: 5, borderRadius: 8, borderWidth: 1, borderColor: `${INDIGO}73` }}
    >
      <Icon name={icon} size={18} color={INDIGO} />
    </Pressable>
  );
}

interface CardProps {
  theme: PluginTheme;
  item: InboxItem;
  rulesReady: boolean;
  // Rules live on the host this screen is open on; an item from another host can't save one here.
  rulesHere: boolean;
  busy: boolean;
  compact: boolean;
  onAnswer: (item: InboxItem, behavior: "allow" | "deny", opts?: { actionId?: string; always?: boolean }) => void;
  onOpen?: (item: InboxItem) => void;
  onOpenWorkspace?: (workspaceId: string, hostId: string) => void;
}

// One hairline-separated row. Wide: status dot, title, meta, age and buttons on one line.
// Compact (phone): title + age, then meta + button; a permission request stacks its buttons below.
function Card({ theme, item, rulesReady, rulesHere, busy, compact, onAnswer, onOpen, onOpenWorkspace }: CardProps) {
  const [always, setAlways] = useState(false);
  const req = item.request;
  const c = theme.colors;
  const status =
    item.reason === "permission" ? { color: c.statusWarning, label: req?.kind ?? "permission" }
    : item.reason === "error" ? { color: c.statusDanger, label: "error" }
    : { color: c.statusSuccess, label: "finished" };
  const canAlways = !!req && req.kind === "tool" && !!req.command && !req.risky && !!item.projectId && rulesReady && rulesHere;
  const customActions = req?.actions ?? [];

  const dot = <View accessibilityLabel={status.label} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: status.color }} />;
  const title = (
    <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600", flexShrink: 1 }} numberOfLines={compact ? 2 : 1}>
      {item.title}
      {item.reason === "error" ? <Text style={{ color: c.statusDanger, fontSize: FS.small, fontWeight: "400" }}>{"  error"}</Text> : null}
    </Text>
  );
  const info = [item.hostLabel, item.provider, item.project, item.workspace].filter(Boolean).join(" · ");
  const meta = (
    <Text style={{ color: c.foregroundMuted, fontSize: FS.small, flex: 1, minWidth: 0 }} numberOfLines={1}>
      {info}
    </Text>
  );
  const time = <Text style={{ color: c.foregroundMuted, fontSize: FS.small, flexShrink: 0 }} numberOfLines={1}>{age(item.at)}</Text>;
  const open = <OpenButtons item={item} onOpen={onOpen} onOpenWorkspace={onOpenWorkspace} />;
  const answers = req ? (
    <>
      {customActions.length > 0
        ? customActions.map((a) => (
            <Btn key={a.id} theme={theme} label={a.label} tone={a.behavior === "allow" ? "ok" : "bad"} disabled={busy}
              onPress={() => onAnswer(item, a.behavior, { actionId: a.id })} />
          ))
        : (
          <>
            <Btn theme={theme} label="Allow once" tone="ok" disabled={busy} onPress={() => onAnswer(item, "allow", { always })} />
            <Btn theme={theme} label="Deny" tone="bad" disabled={busy} onPress={() => onAnswer(item, "deny")} />
          </>
        )}
      {open}
    </>
  ) : null;
  const alwaysBox = req && customActions.length === 0 && req.kind === "tool" ? (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: always, disabled: !canAlways }}
      disabled={!canAlways}
      onPress={() => setAlways(!always)}
      style={{ opacity: canAlways ? 1 : 0.4 }}
    >
      <Text style={{ color: c.foregroundMuted, fontSize: FS.tiny }}>
        {rulesHere
          ? `${always ? "☑" : "☐"} Always allow this exact command in ${item.project || "this project"}`
          : `Rules are per daemon: open Inbox on ${item.hostLabel} to add one`}
      </Text>
    </Pressable>
  ) : null;

  const detail = req ? (
    <View style={{ gap: 6, marginTop: 8, marginLeft: compact ? 0 : 21 }}>
      {req.kind !== "tool" || !req.command ? <Text style={{ color: c.foreground, fontSize: FS.body }}>{req.title}</Text> : null}
      {req.body ? (
        <View style={{ backgroundColor: c.surface1, borderRadius: 6, padding: 8 }}>
          <Text selectable style={{ color: c.foreground, fontFamily: "monospace", fontSize: FS.small }}>{req.body}</Text>
        </View>
      ) : null}
      {req.risky && rulesHere ? (
        <Text style={{ color: c.statusDanger, fontSize: FS.small }}>Matches a destructive pattern. "Always allow" is off for this command.</Text>
      ) : null}
    </View>
  ) : null;

  const frame = { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: req?.risky ? c.statusDanger : c.border, gap: 3 } as const;

  if (compact) {
    return (
      <View style={{ ...frame, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ paddingTop: 7 }}>{dot}</View>
          <View style={{ flex: 1 }}>{title}</View>
          {time}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 19 }}>
          {meta}
          {req ? null : open}
        </View>
        {detail}
        {req ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            {answers}
            {alwaysBox ? <View style={{ flexBasis: "100%" }}>{alwaysBox}</View> : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={frame}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {dot}
        <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
        {time}
        {req ? answers : open}
        {alwaysBox}
      </View>
      <Text style={{ color: c.foregroundMuted, fontSize: FS.small, marginLeft: 21 }} numberOfLines={1}>{info}</Text>
      {detail}
    </View>
  );
}

// Copy of paseo-running's card, minus "needs you": those agents are already in the queue above.
function RunningRow({ theme, item, now, compact, onOpen, onOpenWorkspace }: {
  theme: PluginTheme; item: RunningItem; now: number; compact: boolean;
  onOpen?: (item: RunningItem) => void; onOpenWorkspace?: (workspaceId: string, hostId: string) => void;
}) {
  const c = theme.colors;
  const quiet = (now - Date.parse(item.updatedAt)) / 60_000 >= QUIET_MIN;
  const dot = <View accessibilityLabel="running" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: INDIGO }} />;
  const title = (
    <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600", flexShrink: 1 }} numberOfLines={compact ? 2 : 1}>
      {item.title}
      {item.background ? <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{"  background tasks"}</Text> : null}
    </Text>
  );
  const info = [item.hostLabel, item.provider, item.project, item.workspace].filter(Boolean).join(" · ");
  const meta = (
    <Text style={{ color: c.foregroundMuted, fontSize: FS.small, flex: 1, minWidth: 0 }} numberOfLines={1}>
      {info}
    </Text>
  );
  const time = <Text style={{ color: c.foregroundMuted, fontSize: FS.small, flexShrink: 0 }} numberOfLines={1}>{span(item.startedAt, now)}</Text>;
  const open = <OpenButtons item={item} onOpen={onOpen} onOpenWorkspace={onOpenWorkspace} />;
  // Wide rows carry host/project here; compact rows show them beside the buttons.
  const update = (
    <Text style={{ color: c.foregroundMuted, fontSize: FS.small, marginLeft: compact ? 19 : 21 }} numberOfLines={1}>
      {[compact ? "" : info, item.model ?? ""].filter(Boolean).map((t) => `${t} · `).join("")}
      <Text style={{ color: quiet ? c.statusWarning : c.foregroundMuted }}>last update {span(item.updatedAt, now)} ago{quiet ? " (quiet)" : ""}</Text>
    </Text>
  );
  const frame = { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.border, gap: 3 } as const;

  if (compact) {
    return (
      <View style={frame}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ paddingTop: 7 }}>{dot}</View>
          <View style={{ flex: 1 }}>{title}</View>
          {time}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 19 }}>
          {meta}
          {open}
        </View>
        {update}
      </View>
    );
  }
  return (
    <View style={frame}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {dot}
        <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
        {time}
        {open}
      </View>
      {update}
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
  const { items: allItems, running: allRunning, problems, loaded, refresh } = useInbox(2000, true);
  const hosts = useHosts();
  // Opens on the daemon selected in the app; the app remounts the screen when that selection changes.
  const [chosen, setChosen] = useState(host.id);
  const scope = chosen === "all" || hosts.some((h) => h.serverId === chosen) ? chosen : "all";
  const items = scope === "all" ? allItems : allItems.filter((i) => i.hostId === scope);
  const countOn = (id: string) => allItems.filter((i) => i.hostId === id).length;
  const running = allRunning.filter((i) => !i.needsYou && (scope === "all" || i.hostId === scope));

  // Re-render each 15 s so the elapsed times advance between polls.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

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

  const openAgent = navigation ? (item: InboxItem | RunningItem) => navigation.openAgent({ agentId: item.agentId, serverId: item.hostId }) : undefined;
  const openWorkspace = navigation ? (workspaceId: string, serverId: string) => navigation.openWorkspace({ workspaceId, serverId }) : undefined;
  const pending = items.filter((i) => i.reason === "permission").length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 12, maxWidth: 860, width: "100%", alignSelf: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Text style={{ color: c.foreground, fontSize: FS.title, fontWeight: "600", flex: 1 }}>
          Inbox <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{items.length ? `${items.length} waiting on you` : "all clear"}</Text>
        </Text>
        <Btn theme={theme} label="Queue" tone={tab === "queue" ? "on" : "plain"} onPress={() => setTab("queue")} />
        <Btn theme={theme} label="Auto-rules" tone={tab === "rules" ? "on" : "plain"} onPress={() => setTab("rules")} />
      </View>

      {hosts.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <Btn theme={theme} label={`All hosts (${allItems.length})`} tone={scope === "all" ? "on" : "plain"} onPress={() => setChosen("all")} />
          {hosts.map((h) => (
            <Btn key={h.serverId} theme={theme} label={`${h.label} (${countOn(h.serverId)})`} tone={scope === h.serverId ? "on" : "plain"} onPress={() => setChosen(h.serverId)} />
          ))}
        </View>
      ) : null}

      {problems.length > 0 ? <Text style={{ color: c.statusWarning, fontSize: FS.small }}>Not shown: {problems.join(" · ")}</Text> : null}

      {tab === "rules" ? <Rules theme={theme} hostLabel={host.label} /> : items.length === 0 ? (
        <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600" }}>
          Waiting on you <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{loaded ? "none" : "loading…"}</Text>
        </Text>
      ) : (
        <>
          <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600" }}>
            Waiting on you <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>
              {items.length} {pending > 0 ? `· ${pending} permission request${pending === 1 ? "" : "s"}, oldest first` : "finished or failed, newest first"}
            </Text>
          </Text>
          <View>
            {items.map((item) => (
              <Card key={item.key} theme={theme} item={item} rulesReady={settings.status === "ready"} rulesHere={item.hostId === host.id}
                busy={busyKey === item.key} compact={layout.compact} onAnswer={(it, behavior, opts) => void respond(it, behavior, opts)} onOpen={openAgent} onOpenWorkspace={openWorkspace} />
            ))}
          </View>
        </>
      )}

      {tab === "queue" && running.length > 0 ? (
        <>
          <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600", marginTop: 12 }}>
            Running <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{running.length} working now, newest first</Text>
          </Text>
          <View>
            {running.map((item) => <RunningRow key={item.key} theme={theme} item={item} now={now} compact={layout.compact} onOpen={openAgent} onOpenWorkspace={openWorkspace} />)}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
