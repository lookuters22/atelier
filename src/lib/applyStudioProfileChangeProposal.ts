import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Apply a `pending_review` row to live `photographers.settings` and/or `studio_business_profiles`
 * via `apply_studio_profile_change_proposal_v1` (SECURITY DEFINER). Marks the proposal `applied`
 * only after successful writes. Same bounded key allowlist as the queue contract; DB CHECK
 * constraints validate geography JSON shapes.
 */
export async function applyStudioProfileChangeProposal(
  supabase: SupabaseClient<Database>,
  params: { proposalId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("apply_studio_profile_change_proposal_v1", {
    p_proposal_id: params.proposalId,
  });

  if (error) {
    const msg = error.message || "Could not apply proposal";
    if (msg.includes("forbidden") || msg.includes("tenant")) {
      return { ok: false, error: "You cannot apply this proposal." };
    }
    if (msg.includes("not found")) {
      return { ok: false, error: "Proposal not found (it may have been removed)." };
    }
    if (msg.includes("not pending review")) {
      return { ok: false, error: "This proposal is no longer pending review." };
    }
    if (msg.includes("not authenticated")) {
      return { ok: false, error: "Sign in to apply proposals." };
    }
    if (msg.includes("has nothing to apply") || msg.includes("invalid proposal schema")) {
      return { ok: false, error: "This proposal cannot be applied (empty or invalid payload)." };
    }
    if (msg.includes("disallow") || msg.includes("unknown or disallowed key")) {
      return { ok: false, error: "Proposal payload is not in the allowed v1 key set." };
    }
    if (msg.includes("check constraint") || msg.includes("violates check constraint") || msg.includes("geography_")) {
      return {
        ok: false,
        error: "Live profile would violate geography or data constraints after this patch. Fix the patch or your current profile, then try again.",
      };
    }
    return { ok: false, error: msg };
  }

  return { ok: true };
}
