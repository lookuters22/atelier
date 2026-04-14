/**
 * Fallback `computeGmailMaterializationBundle` substep timings (grep `gmail_materialize_fallback_substep_v1`).
 * Emitted only when chunk-scoped caches are passed (grouped Gmail approval), not prepared-artifact rows.
 */

export type GmailMaterializeFallbackSubstepStage =
  | "token_resolve"
  | "thread_fetch"
  | "body_extract"
  | "attachment_candidates"
  | "html_inline_sanitize"
  | "render_persist"
  /** Uncaught exception anywhere in bundle compute (see `outcome`). */
  | "compute_bundle_error";

export type GmailMaterializeFallbackSubstepV1 = {
  type: "gmail_materialize_fallback_substep_v1";
  stage: GmailMaterializeFallbackSubstepStage;
  duration_ms: number;
  ok: boolean;
  /** Token thread cache or Gmail GET thread cache. */
  cache_hit?: boolean;
  /** When `ok` is false or stage skipped (e.g. no HTML — sanitize not run). */
  outcome?: string;
  connected_account_id?: string;
  raw_provider_thread_id?: string;
  gmail_message_id?: string;
  attachment_candidate_count?: number;
};

export function logGmailMaterializeFallbackSubstepV1(
  payload: Omit<GmailMaterializeFallbackSubstepV1, "type"> & Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      type: "gmail_materialize_fallback_substep_v1" as const,
      ...payload,
    }),
  );
}
