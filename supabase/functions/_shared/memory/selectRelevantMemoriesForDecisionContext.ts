/**
 * Deterministic case-memory promotion (execute_v3 Step 5C): pick memory ids from header scan + turn text,
 * then hydrate via `fetchSelectedMemoriesFull` (single query). No vector search; no scoring schema.
 *
 * **Truth hierarchy:** `selectedMemories` support orchestrator/verifier reasoning; they do **not** override
 * `playbook_rules`. Only future schema-backed authorized-exception machinery may narrow policy for a case.
 *
 * **Provisional text cues (Tier B):** substring matches for `authorized_exception` / `v3_verify_case_note` / `exception`
 * are **retrieval hints only** — not durable policy semantics. Do not treat them as a full exception system.
 *
 * **Scope:** When `weddingId` is set, rows with `wedding_id === weddingId` are **primary**; `wedding_id === null`
 * (tenant-wide) memories are **fallback**, not equal peers — they sort lower until wedding-scoped rows are exhausted.
 */
import type { MemoryHeader } from "./fetchMemoryHeaders.ts";

/** Hard cap on promoted full memory rows per turn (keep orchestrator payload bounded). */
export const MAX_SELECTED_MEMORIES = 5;

const MIN_TOKEN_LEN = 3;

/** Strong provisional cues (secondary to scope + keywords). Not policy. */
const PROVISIONAL_STRONG_SUBSTRINGS = ["authorized_exception", "v3_verify_case_note"] as const;

function normalizeHeaderWeddingId(h: MemoryHeader): string | null {
  const w = h.wedding_id;
  if (w === undefined || w === null || String(w).trim() === "") return null;
  return String(w).trim();
}

/**
 * Primary = wedding-scoped for this case; fallback = tenant-wide when wedding is in scope.
 * Neutral when no wedding context.
 */
function scopePrimaryRank(effectiveWeddingId: string | null, headerWeddingId: string | null): number {
  if (!effectiveWeddingId) {
    return 0;
  }
  if (headerWeddingId !== null && headerWeddingId === effectiveWeddingId) {
    return 2;
  }
  if (headerWeddingId === null) {
    return 1;
  }
  return 0;
}

/**
 * Provisional text-only ranking boost — not authorized-exception policy (requires schema later).
 */
function provisionalTextCueRank(combinedLc: string): number {
  for (const s of PROVISIONAL_STRONG_SUBSTRINGS) {
    if (combinedLc.includes(s)) {
      return 2;
    }
  }
  if (/\bexception\b/.test(combinedLc)) {
    return 1;
  }
  return 0;
}

function tokenizeForOverlap(text: string): Set<string> {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/g);
  const set = new Set<string>();
  for (const t of raw) {
    if (t.length >= MIN_TOKEN_LEN) set.add(t);
  }
  return set;
}

function keywordOverlapScore(headerText: string, turnBlob: string): number {
  const hTokens = tokenizeForOverlap(headerText);
  if (hTokens.size === 0) return 0;
  const turnTokens = tokenizeForOverlap(turnBlob);
  let n = 0;
  for (const t of hTokens) {
    if (turnTokens.has(t)) n++;
  }
  return n;
}

export type SelectRelevantMemoriesInput = {
  /** Resolved tenant id — not used to trust header ids; hydration enforces `.eq(photographer_id)`. */
  photographerId: string;
  weddingId: string | null;
  /** Reserved for future thread-scoped memories when schema supports it. */
  threadId: string | null;
  rawMessage: string;
  threadSummary: string | null;
  memoryHeaders: MemoryHeader[];
};

/**
 * Returns up to {@link MAX_SELECTED_MEMORIES} memory ids in deterministic priority order.
 * Only ids present in `memoryHeaders` can appear (cross-tenant rows cannot enter via this path).
 */
export function selectRelevantMemoryIdsDeterministic(input: SelectRelevantMemoriesInput): string[] {
  const effectiveWeddingId =
    typeof input.weddingId === "string" && input.weddingId.trim().length > 0 ? input.weddingId.trim() : null;

  const turnBlob = `${input.rawMessage}\n${input.threadSummary ?? ""}`;

  const seen = new Set<string>();
  const rows: {
    id: string;
    scopePrimary: number;
    provisionalCue: number;
    keywordScore: number;
  }[] = [];

  for (const h of input.memoryHeaders) {
    const id = String(h.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const headerWeddingId = normalizeHeaderWeddingId(h);
    const scopePrimary = scopePrimaryRank(effectiveWeddingId, headerWeddingId);
    const combined = `${h.type}\n${h.title}\n${h.summary}`.toLowerCase();
    const provisionalCue = provisionalTextCueRank(combined);
    const keywordScore = keywordOverlapScore(`${h.type} ${h.title} ${h.summary}`, turnBlob);

    rows.push({ id, scopePrimary, provisionalCue, keywordScore });
  }

  rows.sort((a, b) => {
    if (b.scopePrimary !== a.scopePrimary) return b.scopePrimary - a.scopePrimary;
    if (b.provisionalCue !== a.provisionalCue) return b.provisionalCue - a.provisionalCue;
    if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
    return a.id.localeCompare(b.id);
  });

  return rows.slice(0, MAX_SELECTED_MEMORIES).map((r) => r.id);
}
