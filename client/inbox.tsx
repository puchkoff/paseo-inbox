import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useHosts } from "@getpaseo/plugin/client";
import { Icon, ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { InboxItem } from "../shared/inbox.ts";
import type { RunningItem } from "../shared/running.ts";
import { initials } from "../shared/hosts.ts";
import { groupByWorkspace, type WorkspaceRow } from "../shared/workspaces.ts";
import { answer, useArchive, useInbox } from "./use-inbox.ts";

// One scale for the whole screen. 26/17/15/13.5 read too small, 29/19/17/15 too big.
const FS = { title: 27, body: 18, small: 16, tiny: 14 };
// Rows are denser than headings so a long list fits on screen.
const ROW = { title: 16, meta: 14 };

function age(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  return min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
}

const QUIET_MIN = 10;

// Stable colour per host so rows from different daemons tell apart at a glance; mid tones read on light and dark.
const HOST_COLORS = ["#2f80ed", "#d9480f", "#2b8a3e", "#ae3ec9", "#e8590c", "#0c8599", "#c2255c"];
function hostColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return HOST_COLORS[Math.abs(h) % HOST_COLORS.length];
}
function Host({ item }: { item: { hostId: string; hostLabel: string } }) {
  return <Text style={{ color: hostColor(item.hostId), fontWeight: "600" }}>{item.hostLabel}</Text>;
}

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

// Whole-row press target; buttons inside keep their own press.
function Row({ label, onPress, style, children }: { label: string; onPress?: () => void; style: object; children: React.ReactNode }) {
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ ...style, opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

// iOS-style segmented control: one pill track, the chosen option raised.
function Seg<T extends string>({ theme, value, options, onChange }: {
  theme: PluginTheme; value: T; options: { id: T; label: string; icon: string }[]; onChange: (id: T) => void;
}) {
  const c = theme.colors;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: c.surface2, borderRadius: 10, padding: 3 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: on ? c.surface0 : "transparent" }}>
            <Icon name={o.icon} size={15} color={on ? c.foreground : c.foregroundMuted} />
            <Text style={{ color: on ? c.foreground : c.foregroundMuted, fontSize: FS.small, fontWeight: on ? "600" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Host switcher tile: coloured initials, waiting-count badge; unselected tiles are dimmed.
function HostTile({ theme, text, label, color, count, on, onPress }: {
  theme: PluginTheme; text: string; label: string; color: string; count: number; on: boolean; onPress: () => void;
}) {
  const c = theme.colors;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${count} waiting`} accessibilityState={{ selected: on }} onPress={onPress}
      style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: on ? c.foreground : "transparent" }}>
      {/* Dim only the tile so the badge stays readable on an unselected host. */}
      <View style={{ flex: 1, borderRadius: 8, backgroundColor: color, alignItems: "center", justifyContent: "center", opacity: on ? 1 : 0.45 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{text}</Text>
      </View>
      {count > 0 ? (
        // Fixed amber: theme statusWarning is dark brown in some themes, and black text vanished on it.
        <View style={{ position: "absolute", top: -8, right: -8, backgroundColor: "#ffb020", borderColor: c.surface0, borderWidth: 2, borderRadius: 999, paddingHorizontal: 5, minWidth: 22, alignItems: "center" }}>
          <Text style={{ color: "#000", fontSize: 13, fontWeight: "800" }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

interface CardProps {
  theme: PluginTheme;
  item: InboxItem;
  busy: boolean;
  compact: boolean;
  onAnswer: (item: InboxItem, behavior: "allow" | "deny", opts?: { actionId?: string }) => void;
  onOpen?: (item: InboxItem) => void;
}

// One hairline-separated row. Wide: status dot, title, meta, age and buttons on one line.
// Compact (phone): title + age, then meta + button; a permission request stacks its buttons below.
function Card({ theme, item, busy, compact, onAnswer, onOpen }: CardProps) {
  const req = item.request;
  const c = theme.colors;
  const status =
    item.reason === "permission" ? { color: c.statusWarning, label: req?.kind ?? "permission" }
    : item.reason === "error" ? { color: c.statusDanger, label: "error" }
    : item.reason === "archived" ? { color: c.foregroundMuted, label: "archived" }
    : { color: c.statusSuccess, label: "finished" };
  const customActions = req?.actions ?? [];

  const dot = <View accessibilityLabel={status.label} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: status.color }} />;
  const title = (
    <Text style={{ color: c.foreground, fontSize: ROW.title, fontWeight: "600", flexShrink: 1 }} numberOfLines={compact ? 2 : 1}>
      {item.title}
      {item.reason === "error" ? <Text style={{ color: c.statusDanger, fontSize: FS.small, fontWeight: "400" }}>{"  error"}</Text> : null}
    </Text>
  );
  const rest = [item.provider, item.project, item.workspace].filter(Boolean).join(" · ");
  const info = <><Host item={item} />{rest ? ` · ${rest}` : ""}</>;
  const meta = (
    <Text style={{ color: c.foregroundMuted, fontSize: ROW.meta, flex: 1, minWidth: 0 }} numberOfLines={1}>
      {info}
    </Text>
  );
  const time = <Text style={{ color: c.foregroundMuted, fontSize: ROW.meta, flexShrink: 0 }} numberOfLines={1}>{age(item.at)}</Text>;
  const answers = req ? (
    <>
      {customActions.length > 0
        ? customActions.map((a) => (
            <Btn key={a.id} theme={theme} label={a.label} tone={a.behavior === "allow" ? "ok" : "bad"} disabled={busy}
              onPress={() => onAnswer(item, a.behavior, { actionId: a.id })} />
          ))
        : (
          <>
            <Btn theme={theme} label="Allow once" tone="ok" disabled={busy} onPress={() => onAnswer(item, "allow")} />
            <Btn theme={theme} label="Deny" tone="bad" disabled={busy} onPress={() => onAnswer(item, "deny")} />
          </>
        )}
    </>
  ) : null;
  const detail = req ? (
    <View style={{ gap: 6, marginTop: 8, marginLeft: compact ? 0 : 21 }}>
      {req.kind !== "tool" || !req.command ? <Text style={{ color: c.foreground, fontSize: FS.body }}>{req.title}</Text> : null}
      {req.body ? (
        <View style={{ backgroundColor: c.surface1, borderRadius: 6, padding: 8 }}>
          <Text selectable style={{ color: c.foreground, fontFamily: "monospace", fontSize: FS.small }}>{req.body}</Text>
        </View>
      ) : null}
      {req.risky ? <Text style={{ color: c.statusDanger, fontSize: FS.small }}>Matches a destructive pattern.</Text> : null}
    </View>
  ) : null;

  const frame = { paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: req?.risky ? c.statusDanger : c.border, gap: 1 } as const;

  if (compact) {
    return (
      <Row style={frame} label={`Open ${item.title}`} onPress={onOpen ? () => onOpen(item) : undefined}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ paddingTop: 6 }}>{dot}</View>
          <View style={{ flex: 1 }}>{title}</View>
          {time}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 19 }}>
          {meta}
        </View>
        {detail}
        {req ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            {answers}
          </View>
        ) : null}
      </Row>
    );
  }

  return (
    <Row style={frame} label={`Open ${item.title}`} onPress={onOpen ? () => onOpen(item) : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {dot}
        <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
        {time}
        {req ? answers : null}
      </View>
      <Text style={{ color: c.foregroundMuted, fontSize: ROW.meta, marginLeft: 21 }} numberOfLines={1}>{info}</Text>
      {detail}
    </Row>
  );
}

// Copy of paseo-running's card, minus "needs you": those agents are already in the queue above.
function RunningRow({ theme, item, now, compact, onOpen }: {
  theme: PluginTheme; item: RunningItem; now: number; compact: boolean;
  onOpen?: (item: RunningItem) => void;
}) {
  const c = theme.colors;
  const quiet = (now - Date.parse(item.updatedAt)) / 60_000 >= QUIET_MIN;
  const dot = <View accessibilityLabel="running" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: INDIGO }} />;
  const title = (
    <Text style={{ color: c.foreground, fontSize: ROW.title, fontWeight: "600", flexShrink: 1 }} numberOfLines={compact ? 2 : 1}>
      {item.title}
      {item.background ? <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{"  background tasks"}</Text> : null}
    </Text>
  );
  const rest = [item.provider, item.project, item.workspace].filter(Boolean).join(" · ");
  const info = <><Host item={item} />{rest ? ` · ${rest}` : ""}</>;
  const meta = (
    <Text style={{ color: c.foregroundMuted, fontSize: ROW.meta, flex: 1, minWidth: 0 }} numberOfLines={1}>
      {info}
    </Text>
  );
  const time = <Text style={{ color: c.foregroundMuted, fontSize: ROW.meta, flexShrink: 0 }} numberOfLines={1}>{span(item.startedAt, now)}</Text>;
  // Wide rows carry host/project here; compact rows show them beside the buttons.
  const update = (
    <Text style={{ color: c.foregroundMuted, fontSize: ROW.meta, marginLeft: compact ? 19 : 21 }} numberOfLines={1}>
      {compact ? null : <>{info} · </>}
      {item.model ? `${item.model} · ` : ""}
      <Text style={{ color: quiet ? c.statusWarning : c.foregroundMuted }}>last update {span(item.updatedAt, now)} ago{quiet ? " (quiet)" : ""}</Text>
    </Text>
  );
  const frame = { paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.border, gap: 1 } as const;

  if (compact) {
    return (
      <Row style={frame} label={`Open ${item.title}`} onPress={onOpen ? () => onOpen(item) : undefined}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <View style={{ paddingTop: 6 }}>{dot}</View>
          <View style={{ flex: 1 }}>{title}</View>
          {time}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 19 }}>
          {meta}
        </View>
        {update}
      </Row>
    );
  }
  return (
    <Row style={frame} label={`Open ${item.title}`} onPress={onOpen ? () => onOpen(item) : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {dot}
        <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
        {time}
      </View>
      {update}
    </Row>
  );
}

function WorkspaceLine({ theme, row, color, onOpenWorkspace }: {
  theme: PluginTheme; row: WorkspaceRow; color: string; onOpenWorkspace?: (workspaceId: string, hostId: string) => void;
}) {
  const c = theme.colors;
  const ws = row.workspaceId;
  return (
    <Row label={`Open ${row.workspace || row.project}`} onPress={onOpenWorkspace && ws ? () => onOpenWorkspace(ws, row.hostId) : undefined}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ color: c.foreground, fontSize: ROW.title, fontWeight: "600" }} numberOfLines={1}>{row.workspace || row.project}</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: ROW.meta }} numberOfLines={1}>
          <Host item={row} />{[row.project, `${row.agents} agent${row.agents === 1 ? "" : "s"}`, ws ? "" : "workspace archived"].filter(Boolean).map((t) => ` · ${t}`).join("")}
        </Text>
      </View>
    </Row>
  );
}

declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | undefined;
const COLLAPSED_KEY = "paseo-inbox:collapsed";
type SectionId = "waiting" | "running" | "done" | "archive";
const HOST_KEY = "paseo-inbox:host";

function stored(key: string): string | null {
  try { return localStorage?.getItem(key) ?? null; } catch { return null; }
}
function store(key: string, value: string) {
  try { localStorage?.setItem(key, value); } catch { /* private mode: keep in memory */ }
}

// Collapsed sections survive reloads on web; native has no localStorage and starts expanded.
function useCollapsed(): [Set<SectionId>, (id: SectionId) => void] {
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => {
    try {
      // Archive starts collapsed: it is long and loads on demand.
      return new Set(JSON.parse(stored(COLLAPSED_KEY) ?? '["archive"]'));
    } catch {
      return new Set();
    }
  });
  const toggle = (id: SectionId) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    store(COLLAPSED_KEY, JSON.stringify([...next]));
    return next;
  });
  return [collapsed, toggle];
}

// One framed box per section: tinted clickable header, rows below. The note stays visible when collapsed.
function Section({ theme, title, note, open, onToggle, children }: {
  theme: PluginTheme; title: string; note: string; open: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  const c = theme.colors;
  return (
    <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden" }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${open ? "collapse" : "expand"}`} accessibilityState={{ expanded: open }}
        onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: c.surface1, borderBottomWidth: open ? 1 : 0, borderBottomColor: c.border }}>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={18} color={c.foregroundMuted} />
        <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "700" }}>
          {title} <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{note}</Text>
        </Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

export function InboxScreen({ theme, host, layout, navigation }: PluginScreenProps) {
  const c = theme.colors;
  const toast = useToast();
  const [view, setView] = useState<"agents" | "workspaces">("agents");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [collapsed, toggle] = useCollapsed();
  const { items: allItems, running: allRunning, done: allDone, problems, loaded, refresh } = useInbox(2000, true);
  const hosts = useHosts();
  // Opens on the daemon selected in the app; the app remounts the screen when that selection changes.
  // Last picked tile wins; the app's selected daemon is the default.
  const [chosen, pick] = useState(() => stored(HOST_KEY) ?? host.id);
  const setChosen = (id: string) => { pick(id); store(HOST_KEY, id); };
  const scope = chosen === "all" || hosts.some((h) => h.serverId === chosen) ? chosen : "all";
  const scoped = scope === "all" ? allItems : allItems.filter((i) => i.hostId === scope);
  // Finished agents are in Done (below); Waiting keeps permission requests and errors.
  const items = scoped.filter((i) => i.reason !== "finished");
  // An idle agent in a still-working workspace is already in Running as background tasks.
  const done = (scope === "all" ? allDone : allDone.filter((i) => i.hostId === scope)).filter((i) => !allRunning.some((r) => r.hostId === i.hostId && r.agentId === i.agentId));
  const scopeLabel = scope === "all" ? "all hosts" : hosts.find((h) => h.serverId === scope)?.label ?? "";
  const countOn = (id: string) => allItems.filter((i) => i.hostId === id && i.reason !== "finished").length;
  const running = allRunning.filter((i) => !i.needsYou && (scope === "all" || i.hostId === scope));
  const archive = useArchive(scope === "all" ? hosts.map((h) => h.serverId) : [scope], !collapsed.has("archive"));

  // Re-render each 15 s so the elapsed times advance between polls.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  async function respond(item: InboxItem, behavior: "allow" | "deny", opts?: { actionId?: string }) {
    setBusyKey(item.key);
    try {
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
  const byWs = view === "workspaces";
  const wsRows = (list: Parameters<typeof groupByWorkspace>[0], color: string) =>
    groupByWorkspace(list).map((row) => <WorkspaceLine key={row.key} theme={theme} row={row} color={color} onOpenWorkspace={openWorkspace} />);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 12, maxWidth: 860, width: "100%", alignSelf: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Text style={{ color: c.foreground, fontSize: FS.title, fontWeight: "600", flex: 1 }}>
          Inbox <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>
            {items.length ? `${items.length} waiting on you` : "all clear"}{hosts.length > 1 ? ` · ${scopeLabel}` : ""}
          </Text>
        </Text>
        {hosts.length > 1 ? (
          <View style={{ flexDirection: "row", gap: 12, paddingTop: 6, paddingRight: 6 }}>
            <HostTile theme={theme} text="ALL" label="All hosts" color={c.foregroundMuted} count={allItems.filter((i) => i.reason !== "finished").length} on={scope === "all"} onPress={() => setChosen("all")} />
            {hosts.map((h) => (
              <HostTile key={h.serverId} theme={theme} text={initials(h.label)} label={h.label} color={hostColor(h.serverId)}
                count={countOn(h.serverId)} on={scope === h.serverId} onPress={() => setChosen(h.serverId)} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Seg theme={theme} value={view} onChange={setView} options={[{ id: "agents", label: "Agents", icon: "Bot" }, { id: "workspaces", label: "Workspaces", icon: "AppWindow" }]} />
      </View>

      {problems.length > 0 ? <Text style={{ color: c.statusWarning, fontSize: FS.small }}>Not shown: {problems.join(" · ")}</Text> : null}

      <Section theme={theme} title="Waiting on you" open={!collapsed.has("waiting")} onToggle={() => toggle("waiting")}
        note={!loaded ? "loading…" : !items.length ? "none" : `${items.length} ${pending > 0 ? `· ${pending} permission request${pending === 1 ? "" : "s"}, oldest first` : "failed, newest first"}`}>
        {byWs ? wsRows(items, c.statusWarning) : items.map((item) => <Card key={item.key} theme={theme} item={item} busy={busyKey === item.key} compact={layout.compact} onAnswer={(it, behavior, opts) => void respond(it, behavior, opts)} onOpen={openAgent} />)}
      </Section>

      {running.length > 0 ? (
        <Section theme={theme} title="Running" note={`${running.length} working now, newest first`} open={!collapsed.has("running")} onToggle={() => toggle("running")}>
          {byWs ? wsRows(running, INDIGO) : running.map((item) => <RunningRow key={item.key} theme={theme} item={item} now={now} compact={layout.compact} onOpen={openAgent} />)}
        </Section>
      ) : null}

      <Section theme={theme} title="Done" open={!collapsed.has("done")} onToggle={() => toggle("done")}
        note={!loaded ? "loading…" : done.length ? `${done.length} finished in the last 24 h, newest first` : "none in the last 24 h"}>
        {byWs ? wsRows(done, c.statusSuccess) : done.map((item) => <Card key={item.key} theme={theme} item={item} busy={busyKey === item.key} compact={layout.compact} onAnswer={(it, behavior, opts) => void respond(it, behavior, opts)} onOpen={openAgent} />)}
      </Section>

      <Section theme={theme} title="Archive" open={!collapsed.has("archive")} onToggle={() => toggle("archive")}
        note={archive.items.length ? `${archive.items.length}${archive.more ? "+" : ""} archived, newest first` : archive.loading ? "loading…" : collapsed.has("archive") ? "archived agents" : "none"}>
        {byWs ? wsRows(archive.items, c.foregroundMuted) : archive.items.map((item) => (
          <Card key={item.key} theme={theme} item={item} busy={false} compact={layout.compact} onAnswer={() => {}} onOpen={openAgent} />
        ))}
        {archive.error ? <Text style={{ color: c.statusWarning, fontSize: FS.small, margin: 8 }}>Not loaded: {archive.error}</Text> : null}
        {archive.more && archive.items.length > 0 ? (
          <View style={{ alignItems: "flex-start", padding: 8 }}>
            <Btn theme={theme} label={archive.loading ? "Loading…" : "Load more"} disabled={archive.loading} onPress={archive.loadMore} />
          </View>
        ) : null}
      </Section>
    </ScrollView>
  );
}
