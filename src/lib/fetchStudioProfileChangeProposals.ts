import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { validateStudioProfileChangeProposalV1 } from "./studioProfileChangeProposalBounds";
import type { StudioProfileChangeProposalV1 } from "../types/studioProfileChangeProposal.types";

export type StudioProfileChangeProposalListRow = {
  id: string;
  created_at: string;
  review_status: string;
  /** Parsed from `proposal_payload` when valid for schema 1. */
  proposal: StudioProfileChangeProposalV1 | null;
  /** When payload fails validation (e.g. legacy or corrupt row), surface for operators. */
  payload_error: string | null;
  /** Truncated rationale for list rows */
  rationale_preview: string;
};

const SELECT = ["id", "created_at", "review_status", "proposal_payload"].join(", ");

/**
 * List stored proposals (newest first), tenant-scoped via RLS (SELECT only from client; no row mutation here).
 */
export async function fetchStudioProfileChangeProposals(
  supabase: SupabaseClient<Database>,
): Promise<{ rows: StudioProfileChangeProposalListRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("studio_profile_change_proposals")
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows: StudioProfileChangeProposalListRow[] = (data ?? []).map((row) => {
    const parsed = validateStudioProfileChangeProposalV1(row.proposal_payload);
    if (!parsed.ok) {
      return {
        id: row.id,
        created_at: row.created_at,
        review_status: row.review_status,
        proposal: null,
        payload_error: parsed.error,
        rationale_preview: "—",
      };
    }
    const r = parsed.value.rationale;
    const rationale_preview = r.length > 120 ? `${r.slice(0, 119)}…` : r;
    return {
      id: row.id,
      created_at: row.created_at,
      review_status: row.review_status,
      proposal: parsed.value,
      payload_error: null,
      rationale_preview,
    };
  });

  return { rows, error: null };
}
