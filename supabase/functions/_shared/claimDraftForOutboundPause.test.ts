import { describe, expect, it } from "vitest";
import {
  CLAIM_BLOCKED_WEDDING_PAUSE_STATE_UNCONFIRMED_MESSAGE,
  CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE,
  classifyClaimDraftForOutboundRpc,
  isRpcErrorClaimBlockedWeddingPaused,
  isRpcErrorClaimBlockedWeddingPauseStateUnconfirmed,
} from "./claimDraftForOutboundPause.ts";

describe("classifyClaimDraftForOutboundRpc (outbound worker claim step)", () => {
  it("treats wedding-pause atomic refusal as blocked_wedding_paused_at_claim (no throw)", () => {
    expect(
      classifyClaimDraftForOutboundRpc({
        data: null,
        error: { message: CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE },
      }),
    ).toEqual({ kind: "blocked_wedding_paused_at_claim" });
  });

  it("treats unreadable/unjoinable wedding at claim as blocked_wedding_pause_state_unconfirmed_at_claim", () => {
    expect(
      classifyClaimDraftForOutboundRpc({
        data: null,
        error: { message: CLAIM_BLOCKED_WEDDING_PAUSE_STATE_UNCONFIRMED_MESSAGE },
      }),
    ).toEqual({ kind: "blocked_wedding_pause_state_unconfirmed_at_claim" });
  });

  it("throws path: non-pause RPC errors classify as rpc_error", () => {
    expect(
      classifyClaimDraftForOutboundRpc({
        data: null,
        error: { message: "permission denied for function" },
      }),
    ).toEqual({ kind: "rpc_error", message: "permission denied for function" });
  });

  it("happy classify: single row becomes claimed", () => {
    expect(
      classifyClaimDraftForOutboundRpc({
        data: [{ id: "d1", thread_id: "t1", body: "hi" }],
        error: null,
      }),
    ).toEqual({ kind: "claimed", draft: { id: "d1", thread_id: "t1", body: "hi" } });
  });

  it("empty data is no_row (double-claim / tenant mismatch)", () => {
    expect(
      classifyClaimDraftForOutboundRpc({
        data: [],
        error: null,
      }),
    ).toEqual({ kind: "no_row" });
  });
});

describe("isRpcErrorClaimBlockedWeddingPauseStateUnconfirmed", () => {
  it("matches atomic claim-time wedding pause state unconfirmed", () => {
    expect(
      isRpcErrorClaimBlockedWeddingPauseStateUnconfirmed({
        message: `${CLAIM_BLOCKED_WEDDING_PAUSE_STATE_UNCONFIRMED_MESSAGE}: detail`,
      }),
    ).toBe(true);
  });

  it("returns false for paused and unrelated errors", () => {
    expect(isRpcErrorClaimBlockedWeddingPauseStateUnconfirmed({ message: CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE })).toBe(
      false,
    );
    expect(isRpcErrorClaimBlockedWeddingPauseStateUnconfirmed(null)).toBe(false);
  });
});

describe("isRpcErrorClaimBlockedWeddingPaused", () => {
  it("matches PostgREST / Supabase RPC error shape for atomic wedding pause refusal", () => {
    expect(
      isRpcErrorClaimBlockedWeddingPaused({
        message: `${CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE}: Linked wedding is paused`,
      }),
    ).toBe(true);
  });

  it("returns false for unrelated RPC errors", () => {
    expect(isRpcErrorClaimBlockedWeddingPaused({ message: "claim_draft_for_outbound: permission denied" })).toBe(
      false,
    );
    expect(isRpcErrorClaimBlockedWeddingPaused(null)).toBe(false);
  });
});
