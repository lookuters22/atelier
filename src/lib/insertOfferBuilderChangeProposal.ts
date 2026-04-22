import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types";
import { validateOfferBuilderChangeProposalV1 } from "./offerBuilderChangeProposalBounds";

/**
 * Insert a v1 offer-builder change proposal (queue for review; live apply is `apply_offer_builder_change_proposal_v1` only).
 * RLS: tenant insert + `project_id` must belong to the same photographer (`studio_offer_builder_projects`).
 */
export async function insertOfferBuilderChangeProposal(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  rawBody: unknown,
): Promise<{ id: string | null; error: string | null }> {
  const parsed = validateOfferBuilderChangeProposalV1(rawBody);
  if (!parsed.ok) {
    return { id: null, error: parsed.error };
  }
  const projectId = parsed.value.project_id;

  const { data, error } = await supabase
    .from("offer_builder_change_proposals")
    .insert({
      photographer_id: photographerId,
      project_id: projectId,
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
