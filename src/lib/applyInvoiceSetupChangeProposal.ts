import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Apply a `pending_review` invoice-setup proposal to `studio_invoice_setup.template` via
 * `apply_invoice_setup_change_proposal_v1` (SECURITY DEFINER). Marks the proposal `applied` only
 * after the live template write succeeds. No client table UPDATE.
 */
export async function applyInvoiceSetupChangeProposal(
  supabase: SupabaseClient<Database>,
  params: { proposalId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("apply_invoice_setup_change_proposal_v1", {
    p_proposal_id: params.proposalId,
  });

  if (error) {
    const msg = error.message || "Could not apply proposal";
    if (msg.includes("forbidden") || msg.includes("tenant")) {
      return { ok: false, error: "You cannot apply this proposal." };
    }
    if (msg.includes("invoice setup not updated")) {
      return { ok: false, error: "Could not update the live invoice template. Try again or refresh the page." };
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
    if (msg.includes("has nothing to apply") || msg.includes("invalid proposal") || msg.includes("invalid template_patch")) {
      return { ok: false, error: "This proposal cannot be applied (empty or invalid payload)." };
    }
    if (msg.includes("unknown or disallowed key") || msg.includes("disallowed key")) {
      return { ok: false, error: "Proposal payload is not in the allowed v1 key set." };
    }
    if (msg.includes("empty or too long") || msg.includes("is invalid") || msg.includes("too long")) {
      return { ok: false, error: "Proposal values are invalid for apply (check lengths and accent color format)." };
    }
    return { ok: false, error: msg };
  }

  return { ok: true };
}
