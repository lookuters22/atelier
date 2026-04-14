/**
 * Learning-loop path: classify outcome → classifier → Zod → enrich exceptions → single atomic RPC.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../../../../src/types/database.types.ts";
import type { EscalationLearningOutcome } from "../classifyEscalationLearningOutcome.ts";
import { classifyEscalationLearningOutcome } from "../classifyEscalationLearningOutcome.ts";
import { addDaysIsoUtc, DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS } from "../policy/authorizedCaseExceptionExpiry.ts";
import { fetchPlaybookRuleIdForTenantActionKey } from "../policy/upsertAuthorizedCaseExceptionFromEscalationResolution.ts";
import type { LearningLoopResolutionReceipt, OperatorResolutionCorrelation } from "../../../../src/types/operatorResolutionWriteback.types.ts";
import { OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION } from "../../../../src/types/operatorResolutionWriteback.types.ts";
import { classifyOperatorResolutionLearningLoop } from "./classifyOperatorResolutionLearningLoop.ts";
import {
  safeParseOperatorResolutionWritebackEnvelope,
  type ValidationFailedResult,
} from "./operatorResolutionWritebackZod.ts";

export type ExecuteLearningLoopEscalationResolutionParams = {
  photographerId: string;
  escalationId: string;
  resolutionSummary: string;
  photographerReplyRaw: string;
  /**
   * When the caller already ran `classifyEscalationLearningOutcome` (e.g. `resolveOperatorEscalationResolution`
   * branching), pass it to avoid a duplicate classifier call on the open path.
   */
  learningOutcome?: EscalationLearningOutcome;
};

export type ExecuteLearningLoopEscalationResolutionError =
  | { code: "ESCALATION_NOT_FOUND" }
  | { code: "TENANT_MISMATCH" }
  | { code: "ESCALATION_NOT_OPEN" }
  | { code: "LEARNING_LOOP_STATE_INCOMPLETE" }
  | { code: "CLASSIFIER_FAILED"; detail: string }
  | { code: "VALIDATION_FAILED"; issues: ValidationFailedResult["issues"] }
  | { code: "RPC_FAILED"; message: string };

export type ExecuteLearningLoopEscalationResolutionResult =
  | { ok: true; receipt: LearningLoopResolutionReceipt; learningOutcome: EscalationLearningOutcome }
  | { ok: false; error: ExecuteLearningLoopEscalationResolutionError };

function buildCorrelation(
  escalationId: string,
  threadId: string | null,
  weddingId: string | null,
  resolutionSummary: string,
  photographerReplyRaw: string,
): OperatorResolutionCorrelation {
  return {
    escalationId,
    threadId,
    weddingId,
    operatorResolutionSummary: resolutionSummary,
    rawOperatorText: photographerReplyRaw,
  };
}

function mapRpcJsonToReceipt(
  raw: unknown,
  correlation: OperatorResolutionCorrelation,
): LearningLoopResolutionReceipt {
  const o = raw as Record<string, unknown>;
  const status = o.status === "already_completed" ? "already_completed" : "completed";
  const toStrArray = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const closed =
    typeof o.closed_escalation_id === "string" && o.closed_escalation_id.length > 0
      ? o.closed_escalation_id
      : null;
  return {
    status,
    created_exception_ids: toStrArray(o.created_exception_ids),
    created_memory_ids: toStrArray(o.created_memory_ids),
    created_candidate_ids: toStrArray(o.created_candidate_ids),
    closed_escalation_id: closed,
    correlation,
  };
}

/**
 * RPC requires `p_artifacts` length ≥ 1 before the idempotent branch; the idempotent path in Postgres
 * returns before iterating artifacts, so this stub is never applied as a write.
 */
const LEARNING_LOOP_IDEMPOTENT_RPC_ARTIFACTS_STUB: Json[] = [
  {
    kind: "memory",
    learningLoopArtifactKey: "__learning_loop_idempotent_rpc_stub__",
  } as unknown as Json,
];

export async function executeLearningLoopEscalationResolution(
  supabase: SupabaseClient,
  params: ExecuteLearningLoopEscalationResolutionParams,
): Promise<ExecuteLearningLoopEscalationResolutionResult> {
  const { data: row, error: loadErr } = await supabase
    .from("escalation_requests")
    .select(
      "id, photographer_id, status, question_body, action_key, reason_code, wedding_id, thread_id, learning_outcome, resolution_storage_target",
    )
    .eq("id", params.escalationId)
    .maybeSingle();

  if (loadErr) {
    return { ok: false, error: { code: "RPC_FAILED", message: loadErr.message } };
  }
  if (!row) {
    return { ok: false, error: { code: "ESCALATION_NOT_FOUND" } };
  }
  if (row.photographer_id !== params.photographerId) {
    return { ok: false, error: { code: "TENANT_MISMATCH" } };
  }

  const correlation = buildCorrelation(
    row.id,
    row.thread_id,
    row.wedding_id,
    params.resolutionSummary,
    params.photographerReplyRaw,
  );

  const isLearningLoopIdempotentRetry =
    row.status === "answered" &&
    row.resolution_storage_target === "learning_loop";

  if (isLearningLoopIdempotentRetry) {
    if (row.learning_outcome === null || row.learning_outcome === undefined) {
      return { ok: false, error: { code: "LEARNING_LOOP_STATE_INCOMPLETE" } };
    }

    const learningOutcomeStored =
      row.learning_outcome as Database["public"]["Enums"]["escalation_learning_outcome"];

    const { data: rpcData, error: rpcError } = await supabase.rpc("complete_learning_loop_operator_resolution", {
      p_photographer_id: params.photographerId,
      p_escalation_id: row.id,
      p_wedding_id: row.wedding_id,
      p_thread_id: row.thread_id,
      p_learning_outcome: learningOutcomeStored,
      p_artifacts: LEARNING_LOOP_IDEMPOTENT_RPC_ARTIFACTS_STUB as unknown as Json,
    });

    if (rpcError) {
      return { ok: false, error: { code: "RPC_FAILED", message: rpcError.message } };
    }

    const receipt = mapRpcJsonToReceipt(rpcData, correlation);
    return {
      ok: true,
      receipt,
      learningOutcome: learningOutcomeStored as EscalationLearningOutcome,
    };
  }

  if (row.status !== "open") {
    return { ok: false, error: { code: "ESCALATION_NOT_OPEN" } };
  }

  const learningOutcome =
    params.learningOutcome ??
    (await classifyEscalationLearningOutcome({
      questionBody: row.question_body,
      photographerReply: params.photographerReplyRaw,
      resolutionSummary: params.resolutionSummary,
      actionKey: row.action_key,
      weddingId: row.wedding_id,
    }));

  const classified = await classifyOperatorResolutionLearningLoop({
    operatorResolutionText: params.photographerReplyRaw,
    photographerId: params.photographerId,
    escalationContext: {
      escalationId: row.id,
      threadId: row.thread_id,
      weddingId: row.wedding_id,
      actionKey: row.action_key,
      questionBody: row.question_body,
      reasonCode: row.reason_code,
    },
  });

  if (!classified.ok) {
    return {
      ok: false,
      error: { code: "CLASSIFIER_FAILED", detail: `${classified.code}: ${classified.message}` },
    };
  }

  const parsed = classified.data;
  const rec = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  const artifacts = rec?.artifacts;
  if (!Array.isArray(artifacts)) {
    return {
      ok: false,
      error: { code: "CLASSIFIER_FAILED", detail: "Classifier JSON missing artifacts array" },
    };
  }

  const envelopeCandidate = {
    schemaVersion: OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION,
    photographerId: params.photographerId,
    correlation,
    artifacts,
  };

  const zod = safeParseOperatorResolutionWritebackEnvelope(envelopeCandidate);
  if (!zod.ok) {
    return { ok: false, error: { code: "VALIDATION_FAILED", issues: zod.issues } };
  }

  const rpcArtifacts: Json[] = [];
  let memoryOrdinal = 0;

  for (const a of zod.data.artifacts) {
    if (a.kind === "authorized_case_exception") {
      let targetPlaybookRuleId = a.targetPlaybookRuleId ?? null;
      if (targetPlaybookRuleId === null) {
        targetPlaybookRuleId = await fetchPlaybookRuleIdForTenantActionKey(
          supabase,
          params.photographerId,
          a.overridesActionKey,
        );
      }
      const effectiveFromIso = a.effectiveFromIso ?? new Date().toISOString();
      const effectiveUntilIso =
        a.effectiveUntilIso ?? addDaysIsoUtc(DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS);
      rpcArtifacts.push({
        kind: "authorized_case_exception",
        overridesActionKey: a.overridesActionKey,
        targetPlaybookRuleId,
        overridePayload: a.overridePayload as Json,
        effectiveFromIso,
        effectiveUntilIso,
        notes: a.notes ?? null,
      });
    } else if (a.kind === "memory") {
      rpcArtifacts.push({
        kind: "memory",
        memoryType: a.memoryType,
        title: a.title,
        summary: a.summary,
        fullContent: a.fullContent,
        weddingId: a.weddingId ?? null,
        learningLoopArtifactKey: `memory_${memoryOrdinal}`,
      });
      memoryOrdinal += 1;
    } else {
      rpcArtifacts.push({
        kind: "playbook_rule_candidate",
        proposedActionKey: a.proposedActionKey,
        topic: a.topic,
        proposedInstruction: a.proposedInstruction,
        proposedDecisionMode: a.proposedDecisionMode,
        proposedScope: a.proposedScope,
        proposedChannel: a.proposedChannel ?? null,
        sourceClassification: (a.sourceClassification ?? {}) as Json,
        confidence: a.confidence ?? null,
        operatorResolutionSummary: a.operatorResolutionSummary ?? null,
        originatingOperatorText: a.originatingOperatorText ?? null,
        sourceEscalationId: a.sourceEscalationId ?? row.id,
        threadId: a.threadId ?? row.thread_id,
        weddingId: a.weddingId ?? row.wedding_id,
        observationCount: a.observationCount ?? 1,
      });
    }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("complete_learning_loop_operator_resolution", {
    p_photographer_id: params.photographerId,
    p_escalation_id: row.id,
    p_wedding_id: row.wedding_id,
    p_thread_id: row.thread_id,
    p_learning_outcome: learningOutcome,
    p_artifacts: rpcArtifacts as unknown as Json,
  });

  if (rpcError) {
    return { ok: false, error: { code: "RPC_FAILED", message: rpcError.message } };
  }

  const receipt = mapRpcJsonToReceipt(rpcData, correlation);
  return { ok: true, receipt, learningOutcome };
}
