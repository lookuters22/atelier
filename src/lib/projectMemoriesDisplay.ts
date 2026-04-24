/**
 * Aligns project memory list visibility with deterministic rankers: rows targeted by
 * `supersedes_memory_id` from any sibling in the fetched set are treated as hidden/superseded.
 */

export function supersededTargetIdsFromMemoryRows(
  rows: readonly { supersedes_memory_id: string | null }[],
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const sid = r.supersedes_memory_id;
    if (sid == null) continue;
    const t = String(sid).trim();
    if (t !== "") out.add(t);
  }
  return out;
}

export function visibleProjectMemoriesFromFetch<
  T extends { id: string; supersedes_memory_id: string | null },
>(rows: readonly T[]): T[] {
  const superseded = supersededTargetIdsFromMemoryRows(rows);
  return rows.filter((r) => !superseded.has(r.id));
}
