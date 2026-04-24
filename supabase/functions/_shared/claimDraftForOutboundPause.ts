/**
 * `claim_draft_for_outbound` raises this message (ERRCODE P0001) when a wedding-backed
 * draft would otherwise be claimed but the linked wedding is compassion- or strategic-paused
 * at atomic claim time (Slice F2 / outbound pause race closure).
 */
export const CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE = "claim_blocked_wedding_paused" as const;

/** Tenant-aligned wedding row missing / not joinable at claim time — pause flags cannot be confirmed (fail closed). */
export const CLAIM_BLOCKED_WEDDING_PAUSE_STATE_UNCONFIRMED_MESSAGE =
  "claim_blocked_wedding_pause_state_unconfirmed" as const;

export type ClaimedDraftRow = {
  id: string;
  thread_id: string;
  body: string;
};

export type ClaimDraftForOutboundRpcClassification =
  | { kind: "claimed"; draft: ClaimedDraftRow }
  | { kind: "no_row" }
  | { kind: "blocked_wedding_paused_at_claim" }
  | { kind: "blocked_wedding_pause_state_unconfirmed_at_claim" }
  | { kind: "rpc_error"; message: string };

/** Maps PostgREST `rpc('claim_draft_for_outbound')` result for the outbound worker claim step. */
export function classifyClaimDraftForOutboundRpc(args: {
  data: unknown;
  error: { message?: string } | null;
}): ClaimDraftForOutboundRpcClassification {
  const { data, error } = args;
  if (error) {
    if (isRpcErrorClaimBlockedWeddingPaused(error)) {
      return { kind: "blocked_wedding_paused_at_claim" };
    }
    if (isRpcErrorClaimBlockedWeddingPauseStateUnconfirmed(error)) {
      return { kind: "blocked_wedding_pause_state_unconfirmed_at_claim" };
    }
    return { kind: "rpc_error", message: String(error.message ?? "unknown_rpc_error") };
  }
  const rows = (data ?? []) as ClaimedDraftRow[];
  const row = rows[0];
  if (row) return { kind: "claimed", draft: row };
  return { kind: "no_row" };
}

export function isRpcErrorClaimBlockedWeddingPaused(err: { message?: string } | null | undefined): boolean {
  return Boolean(err && String(err.message ?? "").includes(CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE));
}

export function isRpcErrorClaimBlockedWeddingPauseStateUnconfirmed(
  err: { message?: string } | null | undefined,
): boolean {
  return Boolean(err && String(err.message ?? "").includes(CLAIM_BLOCKED_WEDDING_PAUSE_STATE_UNCONFIRMED_MESSAGE));
}
