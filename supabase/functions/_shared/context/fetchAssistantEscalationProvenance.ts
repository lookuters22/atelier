/**
 * Read-only tenant-scoped escalation row for operator Ana (escalation-inspection slice).
 * Grounds "why this escalation" in `escalation_requests` + optional thread/wedding/rule embeds — no invented orchestration.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json } from "../../../../src/types/database.types.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_ESCALATION_QUESTION_BODY_CHARS = 4000;
export const MAX_DECISION_JUSTIFICATION_JSON_CHARS = 12000;
export const MAX_RESOLUTION_TEXT_CHARS = 2500;
export const MAX_RECOMMENDED_RESOLUTION_CHARS = 1500;
export const MAX_PLAYBOOK_RULE_INSTRUCTION_CHARS = 800;

const EVIDENCE_NOTE =
  "Evidence is from `escalation_requests` and optional embeds (`threads`, `weddings`, `playbook_rules`). **action_key** and **reason_code** are row fields. **question_body** is the stored operator question. **decision_justification** is JSON captured at creation (may be truncated). Matching a *human* playbook *label* to **action_key** is **inference** unless **playbook_rules** is embedded or Playbook in Context lists that rule. Do not claim hidden model reasoning — quote fields. If key fields are null or empty, say provenance is **incomplete** on the row.";

function clip(s: string, max: number): { text: string; clipped: boolean } {
  if (s.length <= max) return { text: s, clipped: false };
  return { text: s.slice(0, max), clipped: true };
}

function serializeJsonField(raw: Json | null, max: number): { json: string | null; truncated: boolean } {
  if (raw == null) return { json: null, truncated: false };
  try {
    const s = JSON.stringify(raw);
    if (s.length <= max) return { json: s, truncated: false };
    return { json: `${s.slice(0, max)}…`, truncated: true };
  } catch {
    return { json: "[not JSON-serializable]", truncated: false };
  }
}

export type AssistantEscalationProvenanceSnapshot = {
  didRun: boolean;
  selectionNote: "ok" | "invalid_escalation_id" | "escalation_not_found_or_denied";
  escalationId: string | null;
  status: string | null;
  createdAt: string | null;
  actionKey: string | null;
  reasonCode: string | null;
  questionBody: string | null;
  questionBodyClipped: boolean;
  decisionJustificationJson: string | null;
  decisionJustificationTruncated: boolean;
  operatorDelivery: string | null;
  learningOutcome: string | null;
  promoteToPlaybook: boolean | null;
  playbookRuleId: string | null;
  playbookRule: null | {
    topic: string;
    actionKey: string;
    decisionMode: string;
    instructionPreview: string;
    instructionClipped: boolean;
  };
  recommendedResolution: string | null;
  recommendedResolutionClipped: boolean;
  resolutionStorageTarget: string | null;
  resolutionText: string | null;
  resolutionTextClipped: boolean;
  resolvedAt: string | null;
  resolvedDecisionMode: string | null;
  threadId: string | null;
  weddingId: string | null;
  thread: null | { title: string; kind: string | null };
  wedding: null | { coupleNames: string; stage: string; projectType: string };
  evidenceNote: string;
};

export async function fetchAssistantEscalationProvenance(
  supabase: SupabaseClient,
  photographerId: string,
  escalationIdRaw: unknown,
): Promise<AssistantEscalationProvenanceSnapshot> {
  const escalationId = String(escalationIdRaw ?? "").trim();
  if (!UUID_RE.test(escalationId)) {
    return {
      didRun: true,
      selectionNote: "invalid_escalation_id",
      escalationId: null,
      status: null,
      createdAt: null,
      actionKey: null,
      reasonCode: null,
      questionBody: null,
      questionBodyClipped: false,
      decisionJustificationJson: null,
      decisionJustificationTruncated: false,
      operatorDelivery: null,
      learningOutcome: null,
      promoteToPlaybook: null,
      playbookRuleId: null,
      playbookRule: null,
      recommendedResolution: null,
      recommendedResolutionClipped: false,
      resolutionStorageTarget: null,
      resolutionText: null,
      resolutionTextClipped: false,
      resolvedAt: null,
      resolvedDecisionMode: null,
      threadId: null,
      weddingId: null,
      thread: null,
      wedding: null,
      evidenceNote: EVIDENCE_NOTE,
    };
  }

  const { data, error } = await supabase
    .from("escalation_requests")
    .select(
      "id, created_at, status, action_key, reason_code, question_body, decision_justification, " +
        "operator_delivery, learning_outcome, playbook_rule_id, promote_to_playbook, " +
        "recommended_resolution, resolution_storage_target, resolution_text, resolved_at, resolved_decision_mode, " +
        "thread_id, wedding_id, " +
        "threads(title, kind), " +
        "weddings(couple_names, stage, project_type), " +
        "playbook_rules(topic, action_key, decision_mode, instruction)",
    )
    .eq("id", escalationId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    throw new Error(`fetchAssistantEscalationProvenance: ${error.message}`);
  }
  if (data == null) {
    return {
      didRun: true,
      selectionNote: "escalation_not_found_or_denied",
      escalationId,
      status: null,
      createdAt: null,
      actionKey: null,
      reasonCode: null,
      questionBody: null,
      questionBodyClipped: false,
      decisionJustificationJson: null,
      decisionJustificationTruncated: false,
      operatorDelivery: null,
      learningOutcome: null,
      promoteToPlaybook: null,
      playbookRuleId: null,
      playbookRule: null,
      recommendedResolution: null,
      recommendedResolutionClipped: false,
      resolutionStorageTarget: null,
      resolutionText: null,
      resolutionTextClipped: false,
      resolvedAt: null,
      resolvedDecisionMode: null,
      threadId: null,
      weddingId: null,
      thread: null,
      wedding: null,
      evidenceNote: EVIDENCE_NOTE,
    };
  }

  const row = data as {
    id: string;
    created_at: string;
    status: string;
    action_key: string;
    reason_code: string;
    question_body: string;
    decision_justification: Json;
    operator_delivery: string;
    learning_outcome: string | null;
    playbook_rule_id: string | null;
    promote_to_playbook: boolean;
    recommended_resolution: string | null;
    resolution_storage_target: string | null;
    resolution_text: string | null;
    resolved_at: string | null;
    resolved_decision_mode: string | null;
    thread_id: string | null;
    wedding_id: string | null;
    threads: { title: string; kind: string | null } | null;
    weddings: { couple_names: string; stage: string; project_type: string } | null;
    playbook_rules: {
      topic: string;
      action_key: string;
      decision_mode: string;
      instruction: string;
    } | null;
  };

  const qb = clip(String(row.question_body ?? ""), MAX_ESCALATION_QUESTION_BODY_CHARS);
  const dj = serializeJsonField(row.decision_justification, MAX_DECISION_JUSTIFICATION_JSON_CHARS);
  const rec = row.recommended_resolution == null
    ? { text: null as string | null, clipped: false }
    : clip(row.recommended_resolution, MAX_RECOMMENDED_RESOLUTION_CHARS);
  const resTx = row.resolution_text == null
    ? { text: null as string | null, clipped: false }
    : clip(row.resolution_text, MAX_RESOLUTION_TEXT_CHARS);

  let playbookRule: AssistantEscalationProvenanceSnapshot["playbookRule"] = null;
  if (row.playbook_rules) {
    const pr = row.playbook_rules;
    const inst = clip(String(pr.instruction ?? ""), MAX_PLAYBOOK_RULE_INSTRUCTION_CHARS);
    playbookRule = {
      topic: pr.topic,
      actionKey: pr.action_key,
      decisionMode: pr.decision_mode,
      instructionPreview: inst.text,
      instructionClipped: inst.clipped,
    };
  }

  const th = row.threads;
  const we = row.weddings;

  return {
    didRun: true,
    selectionNote: "ok",
    escalationId: row.id,
    status: row.status,
    createdAt: row.created_at,
    actionKey: row.action_key,
    reasonCode: row.reason_code,
    questionBody: qb.text,
    questionBodyClipped: qb.clipped,
    decisionJustificationJson: dj.json,
    decisionJustificationTruncated: dj.truncated,
    operatorDelivery: row.operator_delivery,
    learningOutcome: row.learning_outcome,
    promoteToPlaybook: row.promote_to_playbook,
    playbookRuleId: row.playbook_rule_id,
    playbookRule,
    recommendedResolution: rec.text,
    recommendedResolutionClipped: rec.clipped,
    resolutionStorageTarget: row.resolution_storage_target,
    resolutionText: resTx.text,
    resolutionTextClipped: resTx.clipped,
    resolvedAt: row.resolved_at,
    resolvedDecisionMode: row.resolved_decision_mode,
    threadId: row.thread_id,
    weddingId: row.wedding_id,
    thread: th ? { title: th.title, kind: th.kind } : null,
    wedding: we
      ? {
          coupleNames: we.couple_names,
          stage: we.stage,
          projectType: we.project_type,
        }
      : null,
    evidenceNote: EVIDENCE_NOTE,
  };
}

export function escalationProvenanceToolPayload(
  snap: AssistantEscalationProvenanceSnapshot,
): Record<string, unknown> {
  return {
    didRun: snap.didRun,
    selectionNote: snap.selectionNote,
    escalation: {
      id: snap.escalationId,
      status: snap.status,
      createdAt: snap.createdAt,
      actionKey: snap.actionKey,
      reasonCode: snap.reasonCode,
      questionBody: snap.questionBody,
      questionBodyClipped: snap.questionBodyClipped,
      decisionJustificationJson: snap.decisionJustificationJson,
      decisionJustificationTruncated: snap.decisionJustificationTruncated,
      operatorDelivery: snap.operatorDelivery,
      learningOutcome: snap.learningOutcome,
      promoteToPlaybook: snap.promoteToPlaybook,
      playbookRuleId: snap.playbookRuleId,
      playbookRule: snap.playbookRule,
      recommendedResolution: snap.recommendedResolution,
      recommendedResolutionClipped: snap.recommendedResolutionClipped,
      resolutionStorageTarget: snap.resolutionStorageTarget,
      resolutionText: snap.resolutionText,
      resolutionTextClipped: snap.resolutionTextClipped,
      resolvedAt: snap.resolvedAt,
      resolvedDecisionMode: snap.resolvedDecisionMode,
      threadId: snap.threadId,
      weddingId: snap.weddingId,
      thread: snap.thread,
      wedding: snap.wedding,
    },
    evidenceNote: snap.evidenceNote,
    semanticsNote:
      "Inferring *who* in the org must act beyond **operator_delivery** / **question_body** is interpretation. Tying **action_key** to a *named* studio playbook rule is **inference** unless **playbookRule** is present or Context Playbook lists that key.",
  };
}
