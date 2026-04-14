/**
 * V3 — persist operator escalation + thread automation hold when strategic trust-repair (STR) / contradiction-risk
 * inbound is detected. Mirrors {@link recordV3OutputAuditorEscalation} (escalation row + hold + operator delivery).
 *
 * Dedupes: at most one **open** STR escalation per thread (`reason_code` = STR stable code).
 * Follow-up suppression uses existing `threads.v3_operator_automation_hold` checks (milestone, prep, calendar, post-wedding, workflow sweep).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ORCHESTRATOR_STR_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";
import { formatOperatorEscalationQuestion } from "../formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
} from "../inngest.ts";
import { detectStrategicTrustRepairOrchestratorRequest } from "./detectStrategicTrustRepairOrchestratorRequest.ts";

const STR_REASON_CODE =
  ORCHESTRATOR_STR_ESCALATION_REASON_CODES.contradiction_or_expectation_repair_request;

const ACTION_KEY_STRATEGIC_TRUST_REPAIR = "orchestrator.client.v1.strategic_trust_repair.v1" as const;

const MAX_INBOUND_SNIPPET_CHARS = 500;

function capInboundSnippet(raw: string): string {
  const t = raw.trim();
  if (t.length <= MAX_INBOUND_SNIPPET_CHARS) return t;
  return t.slice(0, MAX_INBOUND_SNIPPET_CHARS - 1).trimEnd() + "…";
}

export type RecordStrategicTrustRepairEscalationResult =
  | {
      recorded: false;
      reason:
        | "no_thread"
        | "not_detected"
        | "open_str_escalation_exists"
        | "dedupe_query_failed"
        | "hold_update_failed";
      escalationId?: string;
    }
  | { recorded: true; escalationId: string };

export async function recordStrategicTrustRepairEscalation(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    threadId: string | null;
    weddingId: string | null;
    rawMessage: string;
    threadContextSnippet?: string;
  },
): Promise<RecordStrategicTrustRepairEscalationResult> {
  const { photographerId, threadId, weddingId, rawMessage, threadContextSnippet } = params;

  if (!threadId) {
    return { recorded: false, reason: "no_thread" };
  }

  const det = detectStrategicTrustRepairOrchestratorRequest(rawMessage, threadContextSnippet);
  if (!det.hit) {
    return { recorded: false, reason: "not_detected" };
  }

  const { data: existingOpen, error: dedupeErr } = await supabase
    .from("escalation_requests")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .eq("reason_code", STR_REASON_CODE)
    .eq("status", "open")
    .maybeSingle();

  if (dedupeErr) {
    console.error("[recordStrategicTrustRepairEscalation] dedupe select failed:", dedupeErr.message);
    return { recorded: false, reason: "dedupe_query_failed" };
  }

  if (existingOpen?.id) {
    return {
      recorded: false,
      reason: "open_str_escalation_exists",
      escalationId: existingOpen.id as string,
    };
  }

  const excerpt = capInboundSnippet(rawMessage);
  const question_body = formatOperatorEscalationQuestion(
    `V3 STR: client message signals contradiction / expectation mismatch — needs human reconciliation (not auto-reply). ${STR_REASON_CODE}`,
  );
  if (!question_body) {
    return { recorded: false, reason: "not_detected" };
  }

  const { data, error } = await supabase
    .from("escalation_requests")
    .insert({
      photographer_id: photographerId,
      thread_id: threadId,
      wedding_id: weddingId,
      action_key: ACTION_KEY_STRATEGIC_TRUST_REPAIR,
      reason_code: STR_REASON_CODE,
      question_body,
      decision_justification: {
        why_blocked:
          "Deterministic strategic trust-repair gate: inbound text matches contradiction / prior-vs-current expectation mismatch / credibility-risk patterns. Automation must not treat this as a routine client thread until a human reconciles.",
        missing_capability_or_fact: excerpt,
        risk_class: "strategic_trust_repair",
        evidence_refs: [`thread:${threadId}`, "detector:v3_strategic_trust_repair", `str_reason:${STR_REASON_CODE}`],
        recommended_next_step:
          "Operator-owned reply: align facts with CRM/thread history; do not let milestone/prep/calendar automations substitute for reconciliation while hold is active.",
      },
      status: "open",
      operator_delivery: "urgent_now",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[recordStrategicTrustRepairEscalation] insert failed:", error?.message);
    return { recorded: false, reason: "not_detected" };
  }

  const escalationId = data.id as string;

  const questionBodyWithIds =
    `${question_body}\nEscalation ID: ${escalationId}\nClient thread: ${threadId}`;

  const { error: qErr } = await supabase
    .from("escalation_requests")
    .update({ question_body: questionBodyWithIds })
    .eq("id", escalationId)
    .eq("photographer_id", photographerId);

  if (qErr) {
    console.error("[recordStrategicTrustRepairEscalation] question_body update failed:", qErr.message);
  }

  const { error: holdErr } = await supabase
    .from("threads")
    .update({
      v3_operator_automation_hold: true,
      v3_operator_hold_escalation_id: escalationId,
    })
    .eq("id", threadId)
    .eq("photographer_id", photographerId);

  if (holdErr) {
    console.error("[recordStrategicTrustRepairEscalation] thread hold update failed:", holdErr.message);
    const { error: dismissErr } = await supabase
      .from("escalation_requests")
      .update({
        status: "dismissed",
        resolved_at: new Date().toISOString(),
        resolution_text:
          "V3 STR aborted: thread v3_operator_automation_hold could not be applied (system). Escalation voided so a retry can re-attempt.",
      })
      .eq("id", escalationId)
      .eq("photographer_id", photographerId);

    if (dismissErr) {
      console.error(
        "[recordStrategicTrustRepairEscalation] void STR escalation after hold failure failed:",
        dismissErr.message,
      );
    }
    return { recorded: false, reason: "hold_update_failed", escalationId };
  }

  try {
    inngest.setEnvVars();
    await inngest.send({
      name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
      data: {
        schemaVersion: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
        photographerId,
        escalationId,
        operatorDelivery: "urgent_now" as const,
        questionBody: questionBodyWithIds,
        threadId,
      },
    });
  } catch (e) {
    console.error("[recordStrategicTrustRepairEscalation] inngest.send failed:", e);
  }

  return { recorded: true, escalationId };
}
