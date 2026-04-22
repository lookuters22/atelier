/**
 * Read-only tenant-scoped draft row + thread envelope for operator Ana draft-inspection (Slice F4).
 * Grounds "why this draft" in `drafts` columns and optional `instruction_history` JSON — no invented reasoning.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json } from "../../../../src/types/database.types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_DRAFT_BODY_PREVIEW_CHARS = 2500;
export const MAX_INSTRUCTION_HISTORY_JSON_CHARS = 12000;

export type AssistantDraftProvenanceSnapshot = {
  didRun: boolean;
  selectionNote: "ok" | "invalid_draft_id" | "draft_not_found_or_denied";
  draftId: string | null;
  threadId: string | null;
  status: string | null;
  createdAt: string | null;
  decisionMode: string | null;
  sourceActionKey: string | null;
  bodyPreview: string | null;
  bodyPreviewClipped: boolean;
  threadTitle: string | null;
  weddingId: string | null;
  threadKind: string | null;
  instructionHistoryJson: string | null;
  instructionHistoryTruncated: boolean;
  /** When `instruction_history` is an array, its length; otherwise null. */
  instructionHistoryStepCount: number | null;
  evidenceNote: string;
};

const EVIDENCE_NOTE =
  "Evidence is from `drafts` + `threads` only. `source_action_key` / `decision_mode` are row fields. `instruction_history` is stored JSON (orchestrator/persona steps when present). Do not treat model paraphrase as hidden system reasoning — quote fields. If history is null/empty, say provenance on the row is incomplete.";

function clip(s: string, max: number): { text: string; clipped: boolean } {
  if (s.length <= max) return { text: s, clipped: false };
  return { text: s.slice(0, max), clipped: true };
}

function serializeInstructionHistory(raw: Json | null): {
  json: string | null;
  truncated: boolean;
  stepCount: number | null;
} {
  if (raw == null) {
    return { json: null, truncated: false, stepCount: null };
  }
  try {
    const stepCount = Array.isArray(raw) ? raw.length : null;
    const s = JSON.stringify(raw);
    if (s.length <= MAX_INSTRUCTION_HISTORY_JSON_CHARS) {
      return { json: s, truncated: false, stepCount };
    }
    return {
      json: `${s.slice(0, MAX_INSTRUCTION_HISTORY_JSON_CHARS)}…`,
      truncated: true,
      stepCount,
    };
  } catch {
    return { json: "[instruction_history: not JSON-serializable]", truncated: false, stepCount: null };
  }
}

export async function fetchAssistantDraftProvenance(
  supabase: SupabaseClient,
  photographerId: string,
  draftIdRaw: unknown,
): Promise<AssistantDraftProvenanceSnapshot> {
  const draftId = String(draftIdRaw ?? "").trim();
  if (!UUID_RE.test(draftId)) {
    return {
      didRun: true,
      selectionNote: "invalid_draft_id",
      draftId: null,
      threadId: null,
      status: null,
      createdAt: null,
      decisionMode: null,
      sourceActionKey: null,
      bodyPreview: null,
      bodyPreviewClipped: false,
      threadTitle: null,
      weddingId: null,
      threadKind: null,
      instructionHistoryJson: null,
      instructionHistoryTruncated: false,
      instructionHistoryStepCount: null,
      evidenceNote: EVIDENCE_NOTE,
    };
  }

  const { data, error } = await supabase
    .from("drafts")
    .select(
      "id, thread_id, status, created_at, decision_mode, source_action_key, body, instruction_history, threads(title, wedding_id, kind)",
    )
    .eq("id", draftId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    throw new Error(`fetchAssistantDraftProvenance: ${error.message}`);
  }
  if (data == null) {
    return {
      didRun: true,
      selectionNote: "draft_not_found_or_denied",
      draftId,
      threadId: null,
      status: null,
      createdAt: null,
      decisionMode: null,
      sourceActionKey: null,
      bodyPreview: null,
      bodyPreviewClipped: false,
      threadTitle: null,
      weddingId: null,
      threadKind: null,
      instructionHistoryJson: null,
      instructionHistoryTruncated: false,
      instructionHistoryStepCount: null,
      evidenceNote: EVIDENCE_NOTE,
    };
  }

  const row = data as {
    id: string;
    thread_id: string;
    status: string;
    created_at: string;
    decision_mode: string | null;
    source_action_key: string | null;
    body: string;
    instruction_history: Json | null;
    threads: { title: string | null; wedding_id: string | null; kind: string | null } | null;
  };

  const th = row.threads;
  const bodyClip = clip(String(row.body ?? ""), MAX_DRAFT_BODY_PREVIEW_CHARS);
  const hist = serializeInstructionHistory(row.instruction_history);

  return {
    didRun: true,
    selectionNote: "ok",
    draftId: row.id,
    threadId: row.thread_id,
    status: row.status,
    createdAt: row.created_at,
    decisionMode: row.decision_mode,
    sourceActionKey: row.source_action_key,
    bodyPreview: bodyClip.text,
    bodyPreviewClipped: bodyClip.clipped,
    threadTitle: th?.title ?? null,
    weddingId: th?.wedding_id ?? null,
    threadKind: th?.kind ?? null,
    instructionHistoryJson: hist.json,
    instructionHistoryTruncated: hist.truncated,
    instructionHistoryStepCount: hist.stepCount,
    evidenceNote: EVIDENCE_NOTE,
  };
}

/**
 * JSON-safe payload for the operator_lookup_draft tool (bounded).
 */
export function draftProvenanceToolPayload(snap: AssistantDraftProvenanceSnapshot): Record<string, unknown> {
  return {
    didRun: snap.didRun,
    selectionNote: snap.selectionNote,
    draft: {
      id: snap.draftId,
      threadId: snap.threadId,
      status: snap.status,
      createdAt: snap.createdAt,
      decisionMode: snap.decisionMode,
      sourceActionKey: snap.sourceActionKey,
      bodyPreview: snap.bodyPreview,
      bodyPreviewClipped: snap.bodyPreviewClipped,
      threadTitle: snap.threadTitle,
      weddingId: snap.weddingId,
      threadKind: snap.threadKind,
      instructionHistoryJson: snap.instructionHistoryJson,
      instructionHistoryTruncated: snap.instructionHistoryTruncated,
      instructionHistoryStepCount: snap.instructionHistoryStepCount,
    },
    evidenceNote: snap.evidenceNote,
    semanticsNote:
      "Inferring *why* a rule fired beyond these fields is hypothesis — label it. Match Playbook rules by `source_action_key` only when the same key appears in Context playbook excerpts.",
  };
}
