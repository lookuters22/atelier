/**
 * Phase 9 Step 9C — learning inputs from draft approval edits and rewrite feedback (`execute_v3.md`).
 *
 * Writes **memories** only (candidate signals). Does **not** create or update `playbook_rules`.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { memoryScopeForWeddingBinding } from "./memory/memoryInsertScope.ts";
import {
  maybeRecordPatternMapReview,
  patternFingerprintForDraftLearning,
} from "./patternReviewGate.ts";

type ServiceClient = SupabaseClient;

/** Hard cap for approval-edit learning `full_content` (well below legacy 8k insert slice). */
const APPROVAL_EDIT_LEARNING_CONTENT_MAX = 2000;
/** Max chars per middle “changed region” excerpt (not full draft bodies). */
const APPROVAL_EDIT_MIDDLE_EXCERPT_MAX = 120;

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  for (; i < n; i++) {
    if (a[i] !== b[i]) break;
  }
  return i;
}

function commonSuffixLength(a: string, b: string, prefixLen: number): number {
  let s = 0;
  while (
    s < a.length - prefixLen &&
    s < b.length - prefixLen &&
    a[a.length - 1 - s] === b[b.length - 1 - s]
  ) {
    s++;
  }
  return s;
}

function boundedSingleLineExcerpt(s: string, maxLen: number): string {
  const t = s.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/**
 * Bounded edit signal for `draft_approval_edit_learning` — stable fingerprint fields and change metrics
 * plus tiny middle excerpts only; never persists full original or edited draft bodies.
 */
function buildApprovalEditLearningFullContent(params: {
  patternFp: string;
  draftId: string;
  originalBody: string;
  editedBody: string;
}): string {
  const { patternFp, draftId, originalBody, editedBody } = params;
  const o = originalBody;
  const e = editedBody;
  const pre = commonPrefixLength(o, e);
  const suf = commonSuffixLength(o, e, pre);
  const midO = o.slice(pre, Math.max(pre, o.length - suf));
  const midE = e.slice(pre, Math.max(pre, e.length - suf));
  const lines = [
    "9C: learning_input / not_playbook_promoted",
    "channel: approval_edit",
    `pattern_fp:${patternFp}`,
    `draft_id: ${draftId}`,
    "",
    "edit_signal:",
    `  shared_prefix_chars: ${pre}`,
    `  shared_suffix_chars: ${suf}`,
    `  len_original: ${o.length}`,
    `  len_edited: ${e.length}`,
    `  middle_original_len: ${midO.length}`,
    `  middle_edited_len: ${midE.length}`,
    "",
    "middle_excerpt_original:",
    boundedSingleLineExcerpt(midO, APPROVAL_EDIT_MIDDLE_EXCERPT_MAX),
    "",
    "middle_excerpt_edited:",
    boundedSingleLineExcerpt(midE, APPROVAL_EDIT_MIDDLE_EXCERPT_MAX),
  ];
  const text = lines.join("\n");
  if (text.length <= APPROVAL_EDIT_LEARNING_CONTENT_MAX) return text;
  return `${text.slice(0, APPROVAL_EDIT_LEARNING_CONTENT_MAX - 1)}…`;
}

async function afterLearningInsert(
  supabase: ServiceClient,
  params: { photographerId: string; weddingId: string | null; patternFp: string },
): Promise<void> {
  try {
    await maybeRecordPatternMapReview(supabase, params);
  } catch (e) {
    console.error("[9D] pattern review gate:", e);
  }
}

export type CaptureApprovalEditInput = {
  channel: "approval_edit";
  photographerId: string;
  weddingId: string | null;
  draftId: string;
  originalBody: string;
  editedBody: string;
};

export type CaptureRewriteFeedbackInput = {
  channel: "rewrite_feedback";
  photographerId: string;
  weddingId: string | null;
  draftId: string;
  feedback: string;
};

export type CaptureDraftLearningInput = CaptureApprovalEditInput | CaptureRewriteFeedbackInput;

/**
 * Persist a learning signal for Ana; explicit photographer confirmation required before any playbook promotion.
 */
export async function captureDraftLearningInput(
  supabase: ServiceClient,
  input: CaptureDraftLearningInput,
): Promise<void> {
  if (input.channel === "approval_edit") {
    if (input.originalBody.trim() === input.editedBody.trim()) return;

    const patternFp = await patternFingerprintForDraftLearning({
      channel: "approval_edit",
      originalBody: input.originalBody,
      editedBody: input.editedBody,
    });

    const title = "Draft approval edit (learning input)".slice(0, 120);
    const summary =
      "Photographer changed draft body before send — not auto-promoted to global rules.".slice(0, 400);
    const full_content = buildApprovalEditLearningFullContent({
      patternFp,
      draftId: input.draftId,
      originalBody: input.originalBody,
      editedBody: input.editedBody,
    });

    const { error } = await supabase.from("memories").insert({
      photographer_id: input.photographerId,
      wedding_id: input.weddingId,
      scope: memoryScopeForWeddingBinding(input.weddingId),
      type: "draft_approval_edit_learning",
      title,
      summary,
      full_content,
    });

    if (error) throw new Error(`captureDraftLearningInput approval_edit: ${error.message}`);
    await afterLearningInsert(supabase, {
      photographerId: input.photographerId,
      weddingId: input.weddingId,
      patternFp,
    });
    return;
  }

  const fb = input.feedback.trim();
  if (!fb) return;

  const patternFp = await patternFingerprintForDraftLearning({
    channel: "rewrite_feedback",
    feedback: fb,
  });

  const title = "Draft rewrite feedback (learning input)".slice(0, 120);
  const summary = "Photographer feedback for rewrite — not auto-promoted to global rules.".slice(0, 400);
  const full_content = [
    "9C: learning_input / not_playbook_promoted",
    `pattern_fp:${patternFp}`,
    `draft_id: ${input.draftId}`,
    "",
    "feedback:",
    fb.slice(0, 7500),
  ].join("\n");

  const { error } = await supabase.from("memories").insert({
    photographer_id: input.photographerId,
    wedding_id: input.weddingId,
    scope: memoryScopeForWeddingBinding(input.weddingId),
    type: "draft_rewrite_feedback_learning",
    title,
    summary,
    full_content: full_content.slice(0, 8000),
  });

  if (error) throw new Error(`captureDraftLearningInput rewrite_feedback: ${error.message}`);
  await afterLearningInsert(supabase, {
    photographerId: input.photographerId,
    weddingId: input.weddingId,
    patternFp,
  });
}
