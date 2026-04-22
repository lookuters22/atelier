import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type StudioProfileProposalReviewAction = "reject" | "withdraw";

/**
 * Move a `pending_review` row to `rejected` or `withdrawn` via
 * `review_studio_profile_change_proposal` (SECURITY DEFINER RPC — no direct table UPDATE from client).
 */
export async function reviewStudioProfileChangeProposal(
  supabase: SupabaseClient<Database>,
  params: { proposalId: string; action: StudioProfileProposalReviewAction },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p_next_status = (params.action === "reject" ? "rejected" : "withdrawn") as const;

  const { error } = await supabase.rpc("review_studio_profile_change_proposal", {
    p_proposal_id: params.proposalId,
    p_next_status,
  });

  if (error) {
    const msg = error.message || "Could not update proposal";
    if (msg.includes("forbidden") || msg.includes("tenant")) {
      return { ok: false, error: "You cannot update this proposal." };
    }
    if (msg.includes("not found")) {
      return { ok: false, error: "Proposal not found (it may have been removed)." };
    }
    if (msg.includes("not pending review")) {
      return { ok: false, error: "This proposal is no longer pending review." };
    }
    if (msg.includes("not authenticated")) {
      return { ok: false, error: "Sign in to review proposals." };
    }
    return { ok: false, error: msg };
  }

  return { ok: true };
}
