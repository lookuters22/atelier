/**
 * Shared finalize step after `materializeGmailImportCandidate` — updates import_candidates to approved.
 * Used by import-candidate-review and async grouped-approval worker.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function finalizeApprovedImportCandidate(
  supabaseAdmin: SupabaseClient,
  params: {
    importCandidateId: string;
    photographerId: string;
    threadId: string;
    row: Record<string, unknown>;
    now: string;
    extraProvenance?: Record<string, unknown>;
    /** Clears grouped-approval error on success when present. */
    clearImportApprovalError?: boolean;
  },
): Promise<string | null> {
  const {
    importCandidateId,
    photographerId,
    threadId,
    row,
    now,
    extraProvenance,
    clearImportApprovalError = false,
  } = params;

  const baseProv = {
    source: "gmail_label_import",
    gmail_thread_id: row.raw_provider_thread_id,
    materialized_at: now,
    ...(extraProvenance ?? {}),
  };

  const { error: finErr } = await supabaseAdmin
    .from("import_candidates")
    .update({
      status: "approved",
      materialized_thread_id: threadId,
      import_provenance: baseProv,
      updated_at: now,
      ...(clearImportApprovalError ? { import_approval_error: null } : {}),
    })
    .eq("id", importCandidateId)
    .eq("photographer_id", photographerId);

  if (finErr) {
    console.error("[finalizeGmailImportCandidateApproved] candidate finalize", finErr.message);
    return finErr.message;
  }
  return null;
}
