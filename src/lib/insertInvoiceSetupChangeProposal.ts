import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types";
import { validateInvoiceSetupChangeProposalV1 } from "./invoiceSetupChangeProposalBounds";

/**
 * Insert a v1 invoice-setup change proposal (queue for review; **no** live template apply in this path).
 * RLS: tenant INSERT with `photographer_id` = `auth.uid()`.
 */
export async function insertInvoiceSetupChangeProposal(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  rawBody: unknown,
): Promise<{ id: string | null; error: string | null }> {
  const parsed = validateInvoiceSetupChangeProposalV1(rawBody);
  if (!parsed.ok) {
    return { id: null, error: parsed.error };
  }

  const { data, error } = await supabase
    .from("invoice_setup_change_proposals")
    .insert({
      photographer_id: photographerId,
      review_status: "pending_review",
      proposal_payload: parsed.value as Json,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { id: null, error: error.message };
  }
  return { id: data?.id ?? null, error: null };
}
