/**
 * Phase 1 — multi-wedding identity: narrow deterministic rule from thread ↔ wedding links.
 * `candidateWeddingIds` comes from `DecisionContext` / `thread_weddings` (see buildDecisionContext).
 */

/** Stable blocker token for proposals / telemetry — details belong in rationale only. */
export const IDENTITY_THREAD_MULTI_WEDDING_BLOCKER = "identity_thread_multi_wedding" as const;

export function isThreadWeddingIdentityAmbiguous(params: {
  threadId: string | null;
  candidateWeddingIds: string[] | undefined;
}): boolean {
  if (!params.threadId) return false;
  const ids = params.candidateWeddingIds ?? [];
  return ids.length >= 2;
}
