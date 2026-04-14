/**
 * G2/G3/G5: Materialize one staged `import_candidate` into canonical thread + message (+ attachments).
 * Shared by single approve (unfiled) and grouped approve (wedding-scoped).
 */
import {
  type GmailAccountTokenCache,
  type GmailThreadFetchCache,
  computeGmailMaterializationBundle,
} from "./buildGmailMaterializationArtifact.ts";
import { parseGmailImportRenderHtmlRefFromMetadata } from "./gmailPersistRenderArtifact.ts";
import { importGmailAttachmentsForMessage } from "./gmailImportAttachments.ts";
import type { GmailAttachmentCandidate } from "./gmailMimeAttachments.ts";
import {
  finalizeStagedImportAttachmentsToMessage,
  type StagedImportAttachmentRef,
} from "./gmailStageImportCandidateAttachments.ts";
import {
  classifyGmailAttachmentMaterializePath,
  classifyGmailHtmlRenderPath,
  logGmailApproveMaterializeV1,
} from "./gmailImportObservability.ts";
import { isGmailMaterializationArtifactV1 } from "./prepareImportCandidateMaterialization.ts";
import { logGmailImportMaterializeAttachmentSubstepV1 } from "./gmailImportMaterializeAttachmentSubstepObservability.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function gmailExternalThreadKey(rawProviderThreadId: string): string {
  return `gmail:${rawProviderThreadId}`;
}

export type ApproveMaterialization = {
  body: string;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  gmailImport: {
    gmailMessageId: string;
    accessToken: string;
    candidates: GmailAttachmentCandidate[];
  } | null;
  stagedAttachments: StagedImportAttachmentRef[];
  usedPreparedArtifact: boolean;
};

export async function loadGmailImportForApprove(
  row: Record<string, unknown>,
  opts?: {
    gmailAccountTokenCache?: GmailAccountTokenCache | null;
    gmailThreadFetchCache?: GmailThreadFetchCache | null;
  },
): Promise<ApproveMaterialization> {
  const rawArt = row.materialization_artifact;
  if (
    row.materialization_prepare_status === "prepared" &&
    rawArt &&
    isGmailMaterializationArtifactV1(rawArt)
  ) {
    return {
      body: rawArt.body,
      metadata: rawArt.metadata as Record<string, unknown>,
      raw_payload: rawArt.raw_payload as Record<string, unknown>,
      gmailImport: null,
      stagedAttachments: Array.isArray(rawArt.staged_attachments)
        ? (rawArt.staged_attachments as StagedImportAttachmentRef[])
        : [],
      usedPreparedArtifact: true,
    };
  }

  /** A2/G3: same Storage + `render_html_ref` path as prepare — keeps hot `messages` rows lean on approve fallback. */
  const photographerId = typeof row.photographer_id === "string" ? row.photographer_id : null;
  const importCandidateId = typeof row.id === "string" ? row.id : null;
  const persistRender =
    photographerId && importCandidateId
      ? { photographerId, importCandidateId }
      : null;

  const bundle = await computeGmailMaterializationBundle(
    row.connected_account_id as string,
    row.raw_provider_thread_id as string,
    typeof row.snippet === "string" ? row.snippet : null,
    persistRender,
    opts?.gmailAccountTokenCache ?? undefined,
    opts?.gmailThreadFetchCache ?? undefined,
  );
  return {
    body: bundle.body,
    metadata: bundle.metadata,
    raw_payload: bundle.raw_payload,
    gmailImport: bundle.gmailImport,
    stagedAttachments: [],
    usedPreparedArtifact: false,
  };
}

export type MaterializeGmailImportCandidateParams = {
  photographerId: string;
  importCandidateId: string;
  /** Row from `import_candidates` including materialization columns. */
  row: Record<string, unknown>;
  /** G5: when set, thread is filed under this wedding (Pipeline project). */
  weddingId: string | null;
  /** Optional G5 audit — embedded in `ai_routing_metadata` + import_provenance. */
  gmailLabelImportGroupId?: string | null;
  materializedWeddingId?: string | null;
  now: string;
  /** Grouped batch: reuse OAuth resolution across rows in the same chunk (same connected account). */
  gmailAccountTokenCache?: GmailAccountTokenCache | null;
  /** Grouped batch: reuse cold-path Gmail thread fetch when the same thread is processed twice in one chunk. */
  gmailThreadFetchCache?: GmailThreadFetchCache | null;
};

/**
 * Creates or links canonical thread + first message for this candidate.
 * Does not update `import_candidates` — caller finalizes status/materialized_thread_id.
 *
 * `needsThreadWeddingIdUpdate`: when true, the thread row existed before materialize (reuse path)
 * and callers that file under a wedding must set `threads.wedding_id` themselves. When false, a new
 * thread was inserted with `wedding_id` already set (G5 grouped path) — skip redundant updates.
 */
export async function materializeGmailImportCandidate(
  supabaseAdmin: SupabaseClient,
  params: MaterializeGmailImportCandidateParams,
): Promise<{ threadId: string; needsThreadWeddingIdUpdate: boolean } | { error: string }> {
  const {
    photographerId,
    importCandidateId,
    row,
    weddingId,
    gmailLabelImportGroupId,
    materializedWeddingId,
    now,
    gmailAccountTokenCache,
    gmailThreadFetchCache,
  } = params;

  /** Grouped batch passes chunk caches — match fallback bundle substep telemetry scope. */
  const attachmentSubstepTel = Boolean(gmailAccountTokenCache || gmailThreadFetchCache);

  const rawProviderThreadId = row.raw_provider_thread_id as string;
  const connectedAccountId = row.connected_account_id as string;
  const subject = row.subject as string | null | undefined;
  const sourceLabelName = row.source_label_name as string;
  const sourceIdentifier = row.source_identifier as string;

  const externalKey = gmailExternalThreadKey(rawProviderThreadId);

  const { data: existing } = await supabaseAdmin
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("channel", "email")
    .eq("external_thread_key", externalKey)
    .maybeSingle();

  let threadId: string;
  /** New-thread insert sets `wedding_id`; reuse path may still need caller to assign wedding. */
  let needsThreadWeddingIdUpdate = false;

  if (existing?.id) {
    threadId = existing.id as string;
    needsThreadWeddingIdUpdate = true;
    logGmailApproveMaterializeV1({
      photographer_id: photographerId,
      import_candidate_id: importCandidateId,
      thread_id: threadId,
      message_id: "",
      used_prepared_artifact: false,
      materialization_prepare_status: row.materialization_prepare_status as string | null,
      html_render_path: "none",
      approve_fallback_no_prepared_artifact: false,
      html_fallback_inline_not_storage: false,
      attachment_path: "none",
      grouped_batch: Boolean(gmailLabelImportGroupId),
      reuse_existing_thread: true,
    });
  } else {
    const { data: acct } = await supabaseAdmin
      .from("connected_accounts")
      .select("email")
      .eq("id", connectedAccountId)
      .maybeSingle();

    const senderLabel = (acct?.email as string | undefined)?.trim() || "Gmail";

    const title =
      typeof subject === "string" && subject.trim().length > 0
        ? subject.trim().slice(0, 500)
        : "Gmail thread";

    const {
      body: bodyText,
      metadata: msgMeta,
      raw_payload: msgRaw,
      gmailImport,
      stagedAttachments,
      usedPreparedArtifact,
    } = await loadGmailImportForApprove(row, { gmailAccountTokenCache, gmailThreadFetchCache });

    const provenance = {
      source: "gmail_label_import" as const,
      import_candidate_id: importCandidateId,
      gmail_thread_id: rawProviderThreadId,
      source_label_name: sourceLabelName,
      source_label_id: sourceIdentifier,
      connected_account_id: connectedAccountId,
      ...(gmailLabelImportGroupId
        ? { gmail_label_import_group_id: gmailLabelImportGroupId }
        : {}),
      ...(materializedWeddingId ? { materialized_wedding_id: materializedWeddingId } : {}),
    };

    const { data: ins, error: tErr } = await supabaseAdmin
      .from("threads")
      .insert({
        photographer_id: photographerId,
        wedding_id: weddingId,
        title,
        kind: "group",
        channel: "email",
        external_thread_key: externalKey,
        last_activity_at: now,
        ai_routing_metadata: provenance,
      })
      .select("id")
      .single();

    if (tErr || !ins?.id) {
      console.error("[gmailImportMaterialize] thread insert", tErr?.message);
      return { error: tErr?.message ?? "thread_insert_failed" };
    }

    threadId = ins.id as string;

    const { data: msgInserted, error: mErr } = await supabaseAdmin
      .from("messages")
      .insert({
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "in",
        sender: senderLabel,
        body: bodyText,
        sent_at: now,
        metadata: msgMeta,
        raw_payload: Object.keys(msgRaw).length > 0 ? msgRaw : null,
      })
      .select("id")
      .single();

    if (mErr || !msgInserted?.id) {
      console.error("[gmailImportMaterialize] message insert", mErr?.message);
      return { error: mErr?.message ?? "message_insert_failed" };
    }

    const renderRef = parseGmailImportRenderHtmlRefFromMetadata(msgMeta);
    if (renderRef) {
      const { error: artErr } = await supabaseAdmin
        .from("gmail_render_artifacts")
        .update({ message_id: msgInserted.id as string })
        .eq("id", renderRef.artifact_id)
        .eq("photographer_id", photographerId);
      if (artErr) {
        console.warn("[gmailImportMaterialize] gmail_render_artifacts link", artErr.message);
      }
      const { error: colErr } = await supabaseAdmin
        .from("messages")
        .update({ gmail_render_artifact_id: renderRef.artifact_id })
        .eq("id", msgInserted.id as string);
      if (colErr) {
        console.warn("[gmailImportMaterialize] message gmail_render_artifact_id", colErr.message);
      }
    }

    if (stagedAttachments.length > 0) {
      const tStaged = Date.now();
      let fin: Awaited<ReturnType<typeof finalizeStagedImportAttachmentsToMessage>>;
      try {
        fin = await finalizeStagedImportAttachmentsToMessage(supabaseAdmin, {
          photographerId,
          messageId: msgInserted.id as string,
          importCandidateId,
          staged: stagedAttachments,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attachmentSubstepTel) {
          logGmailImportMaterializeAttachmentSubstepV1({
            stage: "staged_finalize",
            duration_ms: Date.now() - tStaged,
            ok: false,
            outcome: msg.slice(0, 300),
            photographer_id: photographerId,
            import_candidate_id: importCandidateId,
            thread_id: threadId,
            message_id: msgInserted.id as string,
            gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
            staged_count: stagedAttachments.length,
          });
        }
        throw e;
      }
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "staged_finalize",
          duration_ms: Date.now() - tStaged,
          ok: true,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
          staged_count: stagedAttachments.length,
        });
      }
      console.log(
        JSON.stringify({
          type: "gmail_import_attachments_staged_finalize",
          message_id: msgInserted.id,
          ...fin,
          used_prepared_artifact: usedPreparedArtifact,
        }),
      );
      const prevGi = (msgMeta as { gmail_import?: Record<string, unknown> }).gmail_import ?? {};
      const pipeline = prevGi.attachment_pipeline;
      const tStagedMeta = Date.now();
      const { error: metaUpErr } = await supabaseAdmin
        .from("messages")
        .update({
          metadata: {
            ...msgMeta,
            gmail_import: {
              ...prevGi,
              attachment_import: {
                pipeline,
                candidate_count: stagedAttachments.length,
                imported: fin.imported,
                failed: fin.failed,
                skipped_oversized: 0,
                skipped_oversized_prefetch: 0,
                skipped_already_present: 0,
                source: "staged_finalize",
              },
            },
          },
        })
        .eq("id", msgInserted.id as string);
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "staged_metadata_update",
          duration_ms: Date.now() - tStagedMeta,
          ok: !metaUpErr,
          outcome: metaUpErr ? metaUpErr.message.slice(0, 300) : undefined,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
        });
      }
      if (metaUpErr) {
        console.warn("[gmailImportMaterialize] attachment metadata update", metaUpErr.message);
      }
    } else if (gmailImport && gmailImport.candidates.length > 0) {
      const tLive = Date.now();
      let att: Awaited<ReturnType<typeof importGmailAttachmentsForMessage>>;
      try {
        att = await importGmailAttachmentsForMessage(supabaseAdmin, {
          accessToken: gmailImport.accessToken,
          gmailMessageId: gmailImport.gmailMessageId,
          photographerId,
          messageId: msgInserted.id as string,
          candidates: gmailImport.candidates,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attachmentSubstepTel) {
          logGmailImportMaterializeAttachmentSubstepV1({
            stage: "live_import",
            duration_ms: Date.now() - tLive,
            ok: false,
            outcome: msg.slice(0, 300),
            photographer_id: photographerId,
            import_candidate_id: importCandidateId,
            thread_id: threadId,
            message_id: msgInserted.id as string,
            gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
            live_candidate_count: gmailImport.candidates.length,
          });
        }
        throw e;
      }
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "live_import",
          duration_ms: Date.now() - tLive,
          ok: true,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
          live_candidate_count: gmailImport.candidates.length,
        });
      }
      console.log(
        JSON.stringify({
          type: "gmail_import_attachments",
          message_id: msgInserted.id,
          ...att,
          used_prepared_artifact: usedPreparedArtifact,
        }),
      );
      const prevGi = (msgMeta as { gmail_import?: Record<string, unknown> }).gmail_import ?? {};
      const pipeline = prevGi.attachment_pipeline;
      const tLiveMeta = Date.now();
      const { error: metaUpErr } = await supabaseAdmin
        .from("messages")
        .update({
          metadata: {
            ...msgMeta,
            gmail_import: {
              ...prevGi,
              attachment_import: {
                pipeline,
                candidate_count: gmailImport.candidates.length,
                imported: att.imported,
                failed: att.failed,
                skipped_oversized: att.skipped_oversized,
                skipped_oversized_prefetch: att.skipped_oversized_prefetch,
                skipped_already_present: att.skipped_already_present,
              },
            },
          },
        })
        .eq("id", msgInserted.id as string);
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "live_metadata_update",
          duration_ms: Date.now() - tLiveMeta,
          ok: !metaUpErr,
          outcome: metaUpErr ? metaUpErr.message.slice(0, 300) : undefined,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
        });
      }
      if (metaUpErr) {
        console.warn("[gmailImportMaterialize] attachment metadata update", metaUpErr.message);
      }
    } else if (attachmentSubstepTel) {
      logGmailImportMaterializeAttachmentSubstepV1({
        stage: "attachments_skip",
        duration_ms: 0,
        ok: true,
        outcome: "no_staged_no_live_candidates",
        photographer_id: photographerId,
        import_candidate_id: importCandidateId,
        thread_id: threadId,
        message_id: msgInserted.id as string,
        gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
      });
    }

    const htmlPath = classifyGmailHtmlRenderPath(msgMeta);
    const attPath = classifyGmailAttachmentMaterializePath({
      stagedCount: stagedAttachments.length,
      liveCandidateCount: gmailImport?.candidates?.length ?? 0,
    });
    logGmailApproveMaterializeV1({
      photographer_id: photographerId,
      import_candidate_id: importCandidateId,
      thread_id: threadId,
      message_id: msgInserted.id as string,
      used_prepared_artifact: usedPreparedArtifact,
      materialization_prepare_status: row.materialization_prepare_status as string | null,
      html_render_path: htmlPath,
      approve_fallback_no_prepared_artifact: !usedPreparedArtifact,
      html_fallback_inline_not_storage: htmlPath === "inline_metadata",
      attachment_path: attPath,
      grouped_batch: Boolean(gmailLabelImportGroupId),
    });
  }

  return { threadId, needsThreadWeddingIdUpdate };
}

/** Create a Pipeline wedding used as the G5 project container for a Gmail label batch. */
export async function createGmailLabelImportWedding(
  supabaseAdmin: SupabaseClient,
  opts: { photographerId: string; labelName: string; now: string },
): Promise<{ weddingId: string } | { error: string }> {
  const coupleNames = `Gmail label: ${opts.labelName}`.trim().slice(0, 500);
  const { data: w, error } = await supabaseAdmin
    .from("weddings")
    .insert({
      photographer_id: opts.photographerId,
      couple_names: coupleNames.length > 0 ? coupleNames : "Gmail import",
      location: "TBD",
      wedding_date: opts.now,
      stage: "inquiry",
      package_inclusions: [],
    })
    .select("id")
    .single();

  if (error || !w?.id) {
    console.error("[gmailImportMaterialize] wedding insert", error?.message);
    return { error: error?.message ?? "wedding_insert_failed" };
  }
  return { weddingId: w.id as string };
}
