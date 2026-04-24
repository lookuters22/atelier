import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types";
import { validateProjectCommercialAmendmentProposalV1 } from "./projectCommercialAmendmentProposalBounds";

/**
 * Insert a v1 project commercial amendment proposal (queue for review; **no** live apply in this path).
 * RLS: tenant INSERT with `photographer_id` = `auth.uid()`.
 */
export async function insertProjectCommercialAmendmentProposal(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  rawBody: unknown,
): Promise<{ id: string | null; error: string | null }> {
  const parsed = validateProjectCommercialAmendmentProposalV1(rawBody);
  if (!parsed.ok) {
    return { id: null, error: parsed.error };
  }
  const row = parsed.value;

  const { data, error } = await supabase
    .from("project_commercial_amendment_proposals")
    .insert({
      photographer_id: photographerId,
      wedding_id: row.wedding_id,
      thread_id: row.client_thread_id ?? null,
      review_status: "pending_review",
      proposal_payload: row as Json,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { id: null, error: error.message };
  }
  return { id: data?.id ?? null, error: null };
}
