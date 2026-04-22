import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Apply a `pending_review` offer-builder proposal to `studio_offer_builder_projects` via
 * `apply_offer_builder_change_proposal_v1` (SECURITY DEFINER). Marks the proposal `applied` only
 * after the live name / `puck_data.root.props.title` write succeeds. No client table UPDATE.
 */
export async function applyOfferBuilderChangeProposal(
  supabase: SupabaseClient<Database>,
  params: { proposalId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("apply_offer_builder_change_proposal_v1", {
    p_proposal_id: params.proposalId,
  });

  if (error) {
    const msg = error.message || "Could not apply proposal";
    if (msg.includes("forbidden") || msg.includes("tenant")) {
      return { ok: false, error: "You cannot apply this proposal." };
    }
    if (msg.includes("not updated") || (msg.includes("offer project") && msg.includes("not found"))) {
      return { ok: false, error: "Could not update the live offer project. Try again or refresh the page." };
    }
    if (msg.includes("not found")) {
      return { ok: false, error: "Proposal or offer project not found (it may have been removed)." };
    }
    if (msg.includes("not pending review")) {
      return { ok: false, error: "This proposal is no longer pending review." };
    }
    if (msg.includes("not authenticated")) {
      return { ok: false, error: "Sign in to apply proposals." };
    }
    if (msg.includes("has nothing to apply") || msg.includes("invalid proposal") || msg.includes("invalid metadata_patch")) {
      return { ok: false, error: "This proposal cannot be applied (empty or invalid payload)." };
    }
    if (msg.includes("disallowed key")) {
      return { ok: false, error: "Proposal payload is not in the allowed v1 key set." };
    }
    if (msg.includes("too long") || msg.includes("empty or too long") || msg.includes("must be a string")) {
      return { ok: false, error: "Proposal values are invalid for apply (check name / title length and content)." };
    }
    return { ok: false, error: msg };
  }

  return { ok: true };
}
