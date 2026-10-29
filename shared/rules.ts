// Flags a request as risky (red row). A heuristic, not a shell parser.
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
