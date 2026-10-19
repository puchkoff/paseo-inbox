import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const ruleSchema = z.object({
  id: z.string(),
  action: z.enum(["allow", "deny"]),
  command: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  createdAt: z.string(),
});
export type Rule = z.infer<typeof ruleSchema>;

export const rulesSettings = defineSettings({
  id: "rules",
  scope: "host",
  version: 1,
  schema: z.object({ rules: z.array(ruleSchema).default([]) }),
});

// Never auto-allowed, and "always allow" is not offered. A heuristic, not a shell parser.
const DESTRUCTIVE = [
  /\brm\s+(-\w*[rf]\w*\s+)+/,
  /\bsudo\b/,
  /\bgit\s+(push\s+.*(--force|-f\b)|reset\s+--hard|clean\s+-\w*f)/,
  /\b(curl|wget)\b.*\|\s*(sudo\s+)?(sh|bash|zsh)\b/,
  /\b(mkfs|dd\s+.*of=|shred|truncate)\b/,
  /\bchmod\s+-R\b|\bchown\s+-R\b/,
  /\bdrop\s+(table|database)\b/i,
  /\bterraform\s+(destroy|apply)\b/,
  /\bdocker\b.*\b(rm|prune|down\s+.*-v)\b/,
  />\s*\/dev\/(sd|nvme)/,
];

export function isDestructive(command: string): boolean {
  return DESTRUCTIVE.some((re) => re.test(command));
}

export function commandOf(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const c = input.command ?? input.cmd;
  return typeof c === "string" && c.trim() ? c.trim() : null;
}

// Exact match only: a rule never covers a longer or chained command.
export function findRule(rules: readonly Rule[], projectId: string, command: string): Rule | undefined {
  return rules.find((r) => r.projectId === projectId && r.command === command.trim());
}
