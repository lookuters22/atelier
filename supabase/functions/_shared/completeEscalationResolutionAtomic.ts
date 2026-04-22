/**
 * Operator escalation resolution: durable writeback + `escalation_requests` finalization in **one DB transaction**
 * per storage branch (RPC). No separate app-layer finalize step — avoids artifact-without-answered drift.
 */
import type { Json } from "../../../src/types/database.types.ts";
import type { EscalationLearningOutcome } from "./classifyEscalationLearningOutcome.ts";
import { extractAuthorizedCaseExceptionPayloadFromOperatorText } from "./policy/extractAuthorizedCaseExceptionPayloadFromOperatorText.ts";
import { fetchPlaybookRuleIdForTenantActionKey } from "./policy/upsertAuthorizedCaseExceptionFromEscalationResolution.ts";
import { addDaysIsoUtc, DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS } from "./policy/authorizedCaseExceptionExpiry.ts";
import { resolveStrictEscalationStorageTarget } from "./resolveStrictEscalationStorageTarget.ts";
import { supabaseAdmin } from "./supabase.ts";

type ServiceRoleClient = typeof supabaseAdmin;

export type WritebackEscalationLearningParams = {
  photographerId: string;
  escalationId: string;
  learningOutcome: EscalationLearningOutcome;
  reasonCode: string;
  actionKey: string;
  decisionJustification: unknown;
  weddingId: string | null;
  questionBody: string;
  resolutionSummary: string;
  photographerReplyRaw?: string | null;
  clientThreadId?: string | null;
};

export type WritebackEscalationLearningResult =
  | { branch: "playbook"; playbookRuleId: string }
  | { branch: "memory"; memoryId: string }
  | { branch: "document"; documentId: string }
  | {
      branch: "authorized_case_exception";
      exceptionId: string;
      playbookRuleId: string | null;
    };

export function topicFromAction(actionKey: string): string {
  const t = actionKey.replace(/_/g, " ").trim() || "escalation";
  return t.slice(0, 200);
}

export async function completeEscalationResolutionAtomic(
  supabase: ServiceRoleClient,
  p: WritebackEscalationLearningParams,
): Promise<WritebackEscalationLearningResult> {
  const target = resolveStrictEscalationStorageTarget({
    learningOutcome: p.learningOutcome,
    reasonCode: p.reasonCode,
    actionKey: p.actionKey,
    decisionJustification: p.decisionJustification,
  });

  if (target === "memories" && p.weddingId && p.photographerReplyRaw && p.photographerReplyRaw.trim().length > 0) {
    const extracted = await extractAuthorizedCaseExceptionPayloadFromOperatorText({
      questionBody: p.questionBody,
      photographerReply: p.photographerReplyRaw.trim(),
      resolutionSummary: p.resolutionSummary,
      actionKey: p.actionKey,
    });

    if (extracted.ok && extracted.applies_policy_override === true) {
      const targetRuleId = await fetchPlaybookRuleIdForTenantActionKey(
        supabase,
        p.photographerId,
        p.actionKey,
      );

      const effectiveFrom = new Date().toISOString();
      const effectiveUntil =
        extracted.effective_until_iso && extracted.effective_until_iso.trim().length > 0
          ? new Date(extracted.effective_until_iso).toISOString()
          : addDaysIsoUtc(DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS);

      const overridePayloadJson = extracted.override_payload as unknown as Json;

      const { data: exceptionId, error } = await supabase.rpc(
        "complete_escalation_resolution_authorized_case_exception",
        {
          p_photographer_id: p.photographerId,
          p_wedding_id: p.weddingId,
          p_thread_id: p.clientThreadId ?? null,
          p_escalation_id: p.escalationId,
          p_overrides_action_key: p.actionKey,
          p_target_playbook_rule_id: targetRuleId,
          p_override_payload: overridePayloadJson,
          p_effective_from: effectiveFrom,
          p_effective_until: effectiveUntil,
          p_notes: p.resolutionSummary.trim().slice(0, 2000),
          p_learning_outcome: p.learningOutcome,
        },
      );

      if (error || !exceptionId) {
        throw new Error(
          `complete_escalation_resolution_authorized_case_exception: ${error?.message ?? "no id"}`,
        );
      }

      return {
        branch: "authorized_case_exception",
        exceptionId: exceptionId as string,
        playbookRuleId: targetRuleId,
      };
    }
  }

  if (target === "documents") {
    const metadata = {
      audit: true,
      escalation_request_id: p.escalationId,
      resolution_text: p.resolutionSummary,
      question_body: p.questionBody,
      action_key: p.actionKey,
      learning_outcome: p.learningOutcome,
    } as unknown as Json;

    const { data: documentId, error } = await supabase.rpc("complete_escalation_resolution_document", {
      p_photographer_id: p.photographerId,
      p_wedding_id: p.weddingId,
      p_escalation_id: p.escalationId,
      p_title: `Escalation audit — ${topicFromAction(p.actionKey)}`.slice(0, 200),
      p_metadata: metadata,
      p_learning_outcome: p.learningOutcome,
    });

    if (error || !documentId) {
      throw new Error(`complete_escalation_resolution_document: ${error?.message ?? "no id"}`);
    }

    return { branch: "document", documentId: documentId as string };
  }

  if (target === "playbook_rules") {
    const instruction =
      `${p.resolutionSummary.trim()}\n\n(Source: operator escalation resolution.)`.slice(0, 8000);

    const { data: playbookRuleId, error } = await supabase.rpc("complete_escalation_resolution_playbook", {
      p_photographer_id: p.photographerId,
      p_escalation_id: p.escalationId,
      p_action_key: p.actionKey,
      p_topic: topicFromAction(p.actionKey),
      p_instruction: instruction,
      p_learning_outcome: p.learningOutcome,
    });

    if (error || !playbookRuleId) {
      throw new Error(`complete_escalation_resolution_playbook: ${error?.message ?? "no id"}`);
    }

    return { branch: "playbook", playbookRuleId: playbookRuleId as string };
  }

  const title = `Case decision: ${topicFromAction(p.actionKey)}`.slice(0, 120);
  const trimmedResolution = p.resolutionSummary.trim();
  const summary = trimmedResolution.slice(0, 400);
  const firstLine = trimmedResolution.split(/\r?\n/)[0]?.trim() ?? "";
  const outcomeLine = firstLine.slice(0, 360);
  const full = [
    `escalation_request_id: ${p.escalationId}`,
    `action_key: ${p.actionKey}`,
    "",
    "Question:",
    p.questionBody,
    "",
    "Resolution:",
    p.resolutionSummary,
  ].join("\n");

  const { data: memoryId, error } = await supabase.rpc("complete_escalation_resolution_memory", {
    p_photographer_id: p.photographerId,
    p_wedding_id: p.weddingId,
    p_escalation_id: p.escalationId,
    p_title: title,
    p_summary: summary,
    p_full_content: full.slice(0, 8000),
    p_learning_outcome: p.learningOutcome,
    p_outcome: outcomeLine.length > 0 ? outcomeLine : null,
  });

  if (error || !memoryId) {
    throw new Error(`complete_escalation_resolution_memory: ${error?.message ?? "no id"}`);
  }

  return { branch: "memory", memoryId: memoryId as string };
}

/** @deprecated Prefer `completeEscalationResolutionAtomic`; kept for call-site compatibility. */
export const writebackEscalationLearning = completeEscalationResolutionAtomic;
