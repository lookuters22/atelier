/**
 * Dashboard worker path: bounded_matchmaker_near_match → link thread to candidate wedding + finalize escalation.
 * Uses DB RPC `complete_bounded_near_match_thread_wedding_link` (atomic link + hold clear + escalation answered).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ExecuteBoundedNearMatchThreadWeddingLinkApprovalParams = {
  photographerId: string;
  escalationId: string;
  resolutionSummary: string;
};

export type ExecuteBoundedNearMatchThreadWeddingLinkApprovalError =
  | { code: "RPC_FAILED"; message: string }
  | { code: "RPC_RETURNED_ERROR"; message: string }
  | {
      code: "THREAD_ALREADY_LINKED";
      message: string;
      threadId: string;
      existingWeddingId: string;
      attemptedWeddingId: string;
    };

export type ExecuteBoundedNearMatchThreadWeddingLinkApprovalResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; error: ExecuteBoundedNearMatchThreadWeddingLinkApprovalError };

function asNonEmptyString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function normalizeRpcResult(raw: Record<string, unknown>): ExecuteBoundedNearMatchThreadWeddingLinkApprovalResult {
  const status = raw.status;
  if (status === "completed" || status === "already_completed") {
    return { ok: true, raw };
  }

  if (status === "thread_already_linked") {
    const threadId = asNonEmptyString(raw.thread_id);
    const existingWeddingId = asNonEmptyString(raw.existing_wedding_id);
    const attemptedWeddingId = asNonEmptyString(raw.attempted_wedding_id);
    if (!threadId || !existingWeddingId || !attemptedWeddingId) {
      return {
        ok: false,
        error: {
          code: "RPC_RETURNED_ERROR",
          message:
            "complete_bounded_near_match_thread_wedding_link: thread_already_linked payload missing thread_id, existing_wedding_id, or attempted_wedding_id",
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "THREAD_ALREADY_LINKED",
        message: `thread_already_linked: thread ${threadId} already linked to wedding ${existingWeddingId} (attempted ${attemptedWeddingId})`,
        threadId,
        existingWeddingId,
        attemptedWeddingId,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "RPC_RETURNED_ERROR",
      message: `complete_bounded_near_match_thread_wedding_link: unexpected status ${String(status)}`,
    },
  };
}

export async function executeBoundedNearMatchThreadWeddingLinkApproval(
  supabase: SupabaseClient,
  params: ExecuteBoundedNearMatchThreadWeddingLinkApprovalParams,
): Promise<ExecuteBoundedNearMatchThreadWeddingLinkApprovalResult> {
  const summary = params.resolutionSummary.trim();
  if (!summary) {
    return { ok: false, error: { code: "RPC_FAILED", message: "resolution_summary required" } };
  }

  const { data, error } = await supabase.rpc("complete_bounded_near_match_thread_wedding_link", {
    p_photographer_id: params.photographerId,
    p_escalation_id: params.escalationId,
    p_resolution_summary: summary,
  });

  if (error) {
    return { ok: false, error: { code: "RPC_FAILED", message: error.message } };
  }

  const raw = data as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: { code: "RPC_RETURNED_ERROR", message: "empty RPC result" } };
  }

  return normalizeRpcResult(raw);
}
