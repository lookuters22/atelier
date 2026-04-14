/**
 * Post-bundle attachment work in `materializeGmailImportCandidate` (grep `gmail_import_materialize_attachment_substep_v1`).
 * Emitted when chunk caches are present (grouped Gmail approval), same signal as fallback bundle substeps.
 */

export type GmailImportMaterializeAttachmentSubstepStage =
  | "staged_finalize"
  | "staged_metadata_update"
  | "live_import"
  | "live_metadata_update"
  | "attachments_skip";

export type GmailImportMaterializeAttachmentSubstepV1 = {
  type: "gmail_import_materialize_attachment_substep_v1";
  stage: GmailImportMaterializeAttachmentSubstepStage;
  duration_ms: number;
  ok: boolean;
  outcome?: string;
  photographer_id: string;
  import_candidate_id: string;
  thread_id: string;
  message_id: string;
  gmail_label_import_group_id?: string | null;
  staged_count?: number;
  live_candidate_count?: number;
};

export function logGmailImportMaterializeAttachmentSubstepV1(
  payload: Omit<GmailImportMaterializeAttachmentSubstepV1, "type"> & Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      type: "gmail_import_materialize_attachment_substep_v1" as const,
      ...payload,
    }),
  );
}
