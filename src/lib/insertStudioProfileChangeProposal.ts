import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types";
import { validateStudioProfileChangeProposalV1 } from "./studioProfileChangeProposalBounds";

/**
 * Insert a v1 studio-profile change proposal (queue for review; **no** apply in this path).
 * Caller must be authenticated; RLS allows INSERT with `photographer_id` = `auth.uid()` (no client UPDATE/DELETE).
 */
export async function insertStudioProfileChangeProposal(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  rawBody: unknown,
): Promise<{ id: string | null; error: string | null }> {
  const parsed = validateStudioProfileChangeProposalV1(rawBody);
  if (!parsed.ok) {
    return { id: null, error: parsed.error };
  }

  const { data, error } = await supabase
    .from("studio_profile_change_proposals")
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
