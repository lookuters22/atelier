/**
 * Structured JSON logs for Gmail import rollout monitoring (grep `gmail_import_*_v1` in Edge/Inngest logs).
 * Fallback paths: approve without prepared artifact, inline HTML vs Storage ref, live vs staged attachments.
 */
import { parseGmailImportRenderHtmlRefFromMetadata } from "./gmailPersistRenderArtifact.ts";

export type GmailHtmlRenderPath = "storage_ref" | "inline_metadata" | "none";

/** Classify first message metadata after materialize (G3 ref vs inline body_html_sanitized). */
export function classifyGmailHtmlRenderPath(messageMetadata: unknown): GmailHtmlRenderPath {
  if (parseGmailImportRenderHtmlRefFromMetadata(messageMetadata)) {
    return "storage_ref";
  }
  if (!messageMetadata || typeof messageMetadata !== "object") return "none";
  const gi = (messageMetadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return "none";
  const h = (gi as Record<string, unknown>).body_html_sanitized;
  if (typeof h === "string" && h.trim().length > 0) return "inline_metadata";
  return "none";
}

export type GmailAttachmentMaterializePath = "staged_finalize" | "live_gmail" | "none";

export function classifyGmailAttachmentMaterializePath(params: {
  stagedCount: number;
  liveCandidateCount: number;
}): GmailAttachmentMaterializePath {
  if (params.stagedCount > 0) return "staged_finalize";
  if (params.liveCandidateCount > 0) return "live_gmail";
  return "none";
}

/** Emitted once per successful new thread+message insert from import approval (single or grouped worker). */
export function logGmailApproveMaterializeV1(payload: {
  photographer_id: string;
  import_candidate_id: string;
  thread_id: string;
  message_id: string;
  used_prepared_artifact: boolean;
  materialization_prepare_status?: string | null;
  html_render_path: GmailHtmlRenderPath;
  /** True when G2 path was not used — heavier approve-time Gmail/body work. */
  approve_fallback_no_prepared_artifact: boolean;
  /** True when HTML is in metadata instead of Storage + render_html_ref. */
  html_fallback_inline_not_storage: boolean;
  attachment_path: GmailAttachmentMaterializePath;
  grouped_batch: boolean;
  reuse_existing_thread?: boolean;
}): void {
  const {
    html_render_path,
    used_prepared_artifact,
    approve_fallback_no_prepared_artifact,
    html_fallback_inline_not_storage,
    attachment_path,
  } = payload;

  console.log(
    JSON.stringify({
      type: "gmail_import_approve_materialize_v1",
      ts: new Date().toISOString(),
      ...payload,
      /** Rollup flags for dashboards / log alerts */
      fallback_flags: {
        approve_without_prepared_artifact: approve_fallback_no_prepared_artifact,
        inline_html_not_render_ref: html_fallback_inline_not_storage,
        live_attachments_not_staged: attachment_path === "live_gmail",
      },
    }),
  );
}

/** G2 prepare worker: whether HTML landed in Storage vs stayed inline in artifact JSON. */
export function logGmailPrepareCompleteV1(payload: {
  import_candidate_id: string;
  photographer_id: string;
  outcome: "prepared" | "prepare_failed";
  has_render_artifact_id: boolean;
  html_in_metadata_inline: boolean;
  error?: string;
}): void {
  console.log(
    JSON.stringify({
      type: "gmail_import_prepare_v1",
      ts: new Date().toISOString(),
      ...payload,
      fallback_flags: {
        prepare_inline_html_not_storage: payload.outcome === "prepared" && payload.html_in_metadata_inline,
        prepare_storage_html: payload.outcome === "prepared" && payload.has_render_artifact_id,
      },
    }),
  );
}

/** G3: bundle path when prepare asked for Storage but upload failed — HTML remains inline in metadata. */
export function logGmailPreparePersistHtmlFailedV1(payload: {
  import_candidate_id: string;
  photographer_id: string;
  reason: string;
}): void {
  console.log(
    JSON.stringify({
      type: "gmail_import_prepare_persist_html_failed_v1",
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
}

/** Edge `import-candidate-review` — queue / single actions (no heavy Gmail work in grouped approve). */
export function logGmailImportEdgeV1(
  payload: {
    stage:
      | "approve_single"
      | "approve_single_queued"
      | "approve_group_queued"
      | "retry_group_queued"
      | "dismiss_group"
      | "dismiss_single";
    photographer_id: string;
    import_candidate_id?: string;
    gmail_label_import_group_id?: string;
    total_candidates?: number;
    wedding_id?: string;
  },
): void {
  console.log(JSON.stringify({ type: "gmail_import_edge_v1", ts: new Date().toISOString(), ...payload }));
}

/** Inngest grouped approval worker — lifecycle. */
export function logGmailGroupApproveWorkerV1(
  payload: {
    stage: "chunk_done" | "finalize_done" | "guard_skip";
    photographer_id: string;
    gmail_label_import_group_id: string;
    chunk_index?: number;
    empty_queue?: boolean;
    /** guard_skip: why the run did not process; finalize_done: optional diagnostic */
    skipped_reason?: string;
    group_status_after?: string;
    approval_processed?: number;
    approval_total?: number;
  },
): void {
  console.log(JSON.stringify({ type: "gmail_import_group_worker_v1", ts: new Date().toISOString(), ...payload }));
}
