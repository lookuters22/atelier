import type { Database } from "./database.types.ts";

/**
 * Strict inclusion tokens for `weddings.package_inclusions` (text[] in DB).
 * Unknown DB strings are dropped by {@link parsePackageInclusions}.
 */
export type PackageInclusionItem =
  | "travel_fee_included"
  | "second_shooter"
  | "rehearsal_dinner_coverage"
  | "engagement_session"
  | "wedding_album"
  | "raw_files_included";

const PACKAGE_INCLUSION_ITEMS: readonly PackageInclusionItem[] = [
  "travel_fee_included",
  "second_shooter",
  "rehearsal_dinner_coverage",
  "engagement_session",
  "wedding_album",
  "raw_files_included",
] as const;

const INCLUSION_SET = new Set<string>(PACKAGE_INCLUSION_ITEMS);

export function isPackageInclusionItem(value: string): value is PackageInclusionItem {
  return INCLUSION_SET.has(value);
}

/**
 * Deterministic: accepts only `string[]` from DB; keeps known union members in order; no freeform parsing.
 */
export function parsePackageInclusions(raw: unknown): PackageInclusionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PackageInclusionItem[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    if (isPackageInclusionItem(x)) out.push(x);
  }
  return out;
}

/** Columns loaded by `buildAgentContext` / `loadCrmSnapshot`. */
type WeddingsRow = Database["public"]["Tables"]["weddings"]["Row"];

export type CrmSnapshotLoadedKeys =
  | "id"
  | "couple_names"
  | "stage"
  | "wedding_date"
  | "location"
  | "balance_due"
  | "strategic_pause"
  | "compassion_pause"
  | "package_name"
  | "contract_value";

/**
 * CRM row slice for orchestrator/decision context. `package_inclusions` is narrowed from DB `string[]`.
 * Row fields are partial when no wedding / no row; `package_inclusions` is always a clean array.
 */
export type CrmSnapshot = Partial<Pick<WeddingsRow, CrmSnapshotLoadedKeys>> & {
  package_inclusions: PackageInclusionItem[];
};

/** Minimal empty snapshot when no wedding is in scope or no row returned. */
export function emptyCrmSnapshot(): CrmSnapshot {
  return { package_inclusions: [] };
}
