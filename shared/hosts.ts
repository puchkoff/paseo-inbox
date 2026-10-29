// Two-letter tile label: first letter of the first and last word, ".local"/domain dropped.
// "big-boy-4-oleg" → "BO", "Olegs-MacBook-Air.local" → "OA".
export function initials(label: string): string {
  const words = label.split(".")[0].split(/[^A-Za-z0-9]+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0) return label.slice(0, 2).toUpperCase();
  const last = words.length > 1 ? words[words.length - 1][0] : words[0][1] ?? "";
  return (words[0][0] + last).toUpperCase();
}
