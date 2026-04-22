import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { validateInvoiceSetupChangeProposalV1 } from "./invoiceSetupChangeProposalBounds";
import type { InvoiceSetupChangeProposalV1 } from "../types/invoiceSetupChangeProposal.types";

export type InvoiceSetupChangeProposalListRow = {
  id: string;
  created_at: string;
  review_status: string;
  /** Parsed from `proposal_payload` when valid for schema 1. */
  proposal: InvoiceSetupChangeProposalV1 | null;
  /** When payload fails validation (e.g. legacy or corrupt row), surface for operators. */
  payload_error: string | null;
  /** Truncated rationale for list rows */
  rationale_preview: string;
};

const SELECT = ["id", "created_at", "review_status", "proposal_payload"].join(", ");

/**
 * List stored invoice-setup change proposals (newest first), tenant-scoped via RLS.
 */
export async function fetchInvoiceSetupChangeProposals(
  supabase: SupabaseClient<Database>,
): Promise<{ rows: InvoiceSetupChangeProposalListRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("invoice_setup_change_proposals")
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return { rows: [], error: error.message };
  }

  const rows: InvoiceSetupChangeProposalListRow[] = (data ?? []).map((row) => {
    const parsed = validateInvoiceSetupChangeProposalV1(row.proposal_payload);
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
