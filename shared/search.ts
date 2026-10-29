type Searchable = { title: string; project: string; workspace: string; hostLabel: string; provider: string };

// Every word of the query must appear in one of the fields, case-insensitive; an empty query matches all.
export function matches(item: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = [item.title, item.project, item.workspace, item.hostLabel, item.provider].join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}
