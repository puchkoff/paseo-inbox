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
  busy: boolean;
  compact: boolean;
  onAnswer: (item: InboxItem, behavior: "allow" | "deny", opts?: { actionId?: string }) => void;
  onOpen?: (item: InboxItem) => void;
  onOpenWorkspace?: (workspaceId: string, hostId: string) => void;
}

// One hairline-separated row. Wide: status dot, title, meta, age and buttons on one line.
// Compact (phone): title + age, then meta + button; a permission request stacks its buttons below.
function Card({ theme, item, busy, compact, onAnswer, onOpen, onOpenWorkspace }: CardProps) {
  const req = item.request;
  const c = theme.colors;
  const status =
    item.reason === "permission" ? { color: c.statusWarning, label: req?.kind ?? "permission" }
    : item.reason === "error" ? { color: c.statusDanger, label: "error" }
    : { color: c.statusSuccess, label: "finished" };
  const customActions = req?.actions ?? [];

  const dot = <View accessibilityLabel={status.label} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: status.color }} />;
  const title = (
    <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600", flexShrink: 1 }} numberOfLines={compact ? 2 : 1}>
      {item.title}
      {item.reason === "error" ? <Text style={{ color: c.statusDanger, fontSize: FS.small, fontWeight: "400" }}>{"  error"}</Text> : null}
    </Text>
  );
  const rest = [item.provider, item.project, item.workspace].filter(Boolean).join(" · ");
  const info = <><Host item={item} />{rest ? ` · ${rest}` : ""}</>;
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
            <Btn theme={theme} label="Allow once" tone="ok" disabled={busy} onPress={() => onAnswer(item, "allow")} />
            <Btn theme={theme} label="Deny" tone="bad" disabled={busy} onPress={() => onAnswer(item, "deny")} />
          </>
        )}
      {open}
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
  const rest = [item.provider, item.project, item.workspace].filter(Boolean).join(" · ");
  const info = <><Host item={item} />{rest ? ` · ${rest}` : ""}</>;
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
      {compact ? null : <>{info} · </>}
      {item.model ? `${item.model} · ` : ""}
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

function WorkspaceLine({ theme, row, onOpenWorkspace }: {
  theme: PluginTheme; row: WorkspaceRow; onOpenWorkspace?: (workspaceId: string, hostId: string) => void;
}) {
  const c = theme.colors;
  const counts = [row.waiting ? `${row.waiting} waiting` : "", row.running ? `${row.running} running` : ""].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View accessibilityLabel={row.waiting ? "waiting" : "running"} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: row.waiting ? c.statusWarning : INDIGO }} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600" }} numberOfLines={1}>{row.workspace || row.project}</Text>
        <Text style={{ color: c.foregroundMuted, fontSize: FS.small }} numberOfLines={1}><Host item={row} />{` · ${row.project} · ${counts}`}</Text>
      </View>
      {onOpenWorkspace ? <IconBtn icon="AppWindow" label="Open workspace" onPress={() => onOpenWorkspace(row.workspaceId, row.hostId)} /> : null}
    </View>
  );
}

declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | undefined;
const COLLAPSED_KEY = "paseo-inbox:collapsed";
type SectionId = "waiting" | "running" | "done";

// Collapsed sections survive reloads on web; native has no localStorage and starts expanded.
function useCollapsed(): [Set<SectionId>, (id: SectionId) => void] {
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(() => {
    try {
      return new Set(JSON.parse(localStorage?.getItem(COLLAPSED_KEY) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const toggle = (id: SectionId) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    try { localStorage?.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* private mode: keep in memory */ }
    return next;
  });
  return [collapsed, toggle];
}

// Pressable section title with a chevron; the muted note stays visible when collapsed.
function SectionHeader({ theme, title, note, open, first, onToggle }: {
  theme: PluginTheme; title: string; note: string; open: boolean; first?: boolean; onToggle: () => void;
}) {
  const c = theme.colors;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${open ? "collapse" : "expand"}`} accessibilityState={{ expanded: open }}
      onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: first ? 0 : 12 }}>
      <Icon name={open ? "ChevronDown" : "ChevronRight"} size={18} color={c.foregroundMuted} />
      <Text style={{ color: c.foreground, fontSize: FS.body, fontWeight: "600" }}>
        {title} <Text style={{ color: c.foregroundMuted, fontSize: FS.small, fontWeight: "400" }}>{note}</Text>
      </Text>
    </Pressable>
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
  const [chosen, setChosen] = useState(host.id);
  const scope = chosen === "all" || hosts.some((h) => h.serverId === chosen) ? chosen : "all";
  const scoped = scope === "all" ? allItems : allItems.filter((i) => i.hostId === scope);
  // Finished agents are in Done (below); Waiting keeps permission requests and errors.
  const items = scoped.filter((i) => i.reason !== "finished");
  // An idle agent in a still-working workspace is already in Running as background tasks.
  const done = (scope === "all" ? allDone : allDone.filter((i) => i.hostId === scope)).filter((i) => !allRunning.some((r) => r.hostId === i.hostId && r.agentId === i.agentId));
  const scopeLabel = scope === "all" ? "all hosts" : hosts.find((h) => h.serverId === scope)?.label ?? "";
  const countOn = (id: string) => allItems.filter((i) => i.hostId === id && i.reason !== "finished").length;
  const running = allRunning.filter((i) => !i.needsYou && (scope === "all" || i.hostId === scope));

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
  const workspaces = groupByWorkspace(items, running);
  const pending = items.filter((i) => i.reason === "permission").length;

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

      {view === "workspaces" ? (
        <View>
          {workspaces.length === 0 ? <Text style={{ color: c.foregroundMuted, fontSize: FS.small }}>{loaded ? "No workspace has an agent waiting or running." : "loading…"}</Text> : null}
          {workspaces.map((row) => <WorkspaceLine key={row.key} theme={theme} row={row} onOpenWorkspace={openWorkspace} />)}
        </View>
      ) : (
        <>
          <SectionHeader theme={theme} title="Waiting on you" first open={!collapsed.has("waiting")} onToggle={() => toggle("waiting")}
            note={!loaded ? "loading…" : !items.length ? "none" : `${items.length} ${pending > 0 ? `· ${pending} permission request${pending === 1 ? "" : "s"}, oldest first` : "failed, newest first"}`} />
          {collapsed.has("waiting") ? null : (
            <View>
              {items.map((item) => (
                <Card key={item.key} theme={theme} item={item}
                  busy={busyKey === item.key} compact={layout.compact} onAnswer={(it, behavior, opts) => void respond(it, behavior, opts)} onOpen={openAgent} onOpenWorkspace={openWorkspace} />
              ))}
            </View>
          )}

          {running.length > 0 ? (
            <>
              <SectionHeader theme={theme} title="Running" note={`${running.length} working now, newest first`} open={!collapsed.has("running")} onToggle={() => toggle("running")} />
              {collapsed.has("running") ? null : (
                <View>
                  {running.map((item) => <RunningRow key={item.key} theme={theme} item={item} now={now} compact={layout.compact} onOpen={openAgent} onOpenWorkspace={openWorkspace} />)}
                </View>
              )}
            </>
          ) : null}

          <SectionHeader theme={theme} title="Done" open={!collapsed.has("done")} onToggle={() => toggle("done")}
            note={!loaded ? "loading…" : done.length ? `${done.length} finished in the last 24 h, newest first` : "none in the last 24 h"} />
          {collapsed.has("done") ? null : (
            <View>
              {done.map((item) => (
                <Card key={item.key} theme={theme} item={item}
                  busy={busyKey === item.key} compact={layout.compact} onAnswer={(it, behavior, opts) => void respond(it, behavior, opts)} onOpen={openAgent} onOpenWorkspace={openWorkspace} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
