/**
 * Single handoff for dashboard + WhatsApp operator escalation resolution:
 * - Default: learning-loop classifier + Zod + `complete_learning_loop_operator_resolution` (multi-artifact, idempotent).
 * - Explicit fallback: `completeEscalationResolutionAtomic` when strict storage target is `documents`
 *   (sensitive/compliance audit — not modeled in the learning-loop RPC).
 *
 * Idempotent retries (`answered` + `resolution_storage_target = learning_loop`) delegate to
 * `executeLearningLoopEscalationResolution` only (no early "not open" guard here).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { EscalationLearningOutcome } from "../classifyEscalationLearningOutcome.ts";
import { classifyEscalationLearningOutcome } from "../classifyEscalationLearningOutcome.ts";
import type { ModelInvocationLogFn } from "../telemetry/modelInvocationLog.ts";
import {
  completeEscalationResolutionAtomic,
  type WritebackEscalationLearningResult,
} from "../completeEscalationResolutionAtomic.ts";
import { clearV3OperatorHoldForResolvedEscalation } from "../operator/threadV3OperatorHold.ts";
import { resolveStrictEscalationStorageTarget } from "../resolveStrictEscalationStorageTarget.ts";
import type { LearningLoopResolutionReceipt } from "../../../../src/types/operatorResolutionWriteback.types.ts";
import {
  executeLearningLoopEscalationResolution,
  type ExecuteLearningLoopEscalationResolutionError,
} from "./executeLearningLoopEscalationResolution.ts";

/**
 * Single ownership: after any successful operator resolution (learning-loop or legacy document),
 * clear the client-thread V3 hold when applicable. Callers (dashboard edge, Inngest) must not duplicate this.
 *
 * `clearV3OperatorHoldForResolvedEscalation` no-ops when `clientThreadId` is null; the conditional DB update
 * is safe to repeat (idempotent for matching escalation id).
 */
async function clearOperatorHoldAfterResolvedEscalation(
  supabase: SupabaseClient,
  photographerId: string,
  escalationId: string,
  threadId: string | null,
): Promise<void> {
  await clearV3OperatorHoldForResolvedEscalation(supabase, {
    photographerId,
    escalationId,
    clientThreadId: threadId,
  });
}

export type ResolveOperatorEscalationResolutionParams = {
  photographerId: string;
  escalationId: string;
  resolutionSummary: string;
  photographerReplyRaw: string;
  /**
   * When set (e.g. WhatsApp bundle classifier), skips duplicate `classifyEscalationLearningOutcome` call.
   */
  prefetchedLearningOutcome?: EscalationLearningOutcome;
  /** When learning outcome is classified here, use this logger (e.g. correlated operator run). */
  telemetryLogger?: ModelInvocationLogFn;
};

export type ResolveOperatorEscalationResolutionError =
  | ExecuteLearningLoopEscalationResolutionError
  | { code: "LEGACY_ATOMIC_FAILED"; message: string };

export type ResolveOperatorEscalationResolutionSuccess =
  | {
      ok: true;
      mode: "learning_loop";
      receipt: LearningLoopResolutionReceipt;
      learningOutcome: EscalationLearningOutcome;
      escalationId: string;
      threadId: string | null;
    }
  | {
      ok: true;
      mode: "legacy_atomic";
      writeback: WritebackEscalationLearningResult;
      learningOutcome: EscalationLearningOutcome;
      escalationId: string;
      threadId: string | null;
    };

export type ResolveOperatorEscalationResolutionResult =
  | ResolveOperatorEscalationResolutionSuccess
  | { ok: false; error: ResolveOperatorEscalationResolutionError };

export async function resolveOperatorEscalationResolution(
  supabase: SupabaseClient,
  params: ResolveOperatorEscalationResolutionParams,
): Promise<ResolveOperatorEscalationResolutionResult> {
  const { data: row, error: loadErr } = await supabase
    .from("escalation_requests")
    .select(
      "id, photographer_id, status, question_body, action_key, reason_code, decision_justification, wedding_id, thread_id, learning_outcome, resolution_storage_target",
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

  const isLearningLoopIdempotentRetry =
    row.status === "answered" && row.resolution_storage_target === "learning_loop";

  if (isLearningLoopIdempotentRetry) {
    const lr = await executeLearningLoopEscalationResolution(supabase, params);
    if (!lr.ok) return lr;
    await clearOperatorHoldAfterResolvedEscalation(supabase, params.photographerId, row.id, row.thread_id);
    return {
      ok: true,
      mode: "learning_loop",
      receipt: lr.receipt,
      learningOutcome: lr.learningOutcome,
      escalationId: row.id,
      threadId: row.thread_id,
    };
  }

  if (row.status !== "open") {
    return { ok: false, error: { code: "ESCALATION_NOT_OPEN" } };
  }

  const learningOutcome =
    params.prefetchedLearningOutcome !== undefined
      ? params.prefetchedLearningOutcome
      : await classifyEscalationLearningOutcome(
          {
            questionBody: row.question_body,
            photographerReply: params.photographerReplyRaw,
            resolutionSummary: params.resolutionSummary,
            actionKey: row.action_key,
            weddingId: row.wedding_id,
          },
          { log: params.telemetryLogger },
        );

  const storageTarget = resolveStrictEscalationStorageTarget({
    learningOutcome,
    reasonCode: row.reason_code,
    actionKey: row.action_key,
    decisionJustification: row.decision_justification,
  });

  if (storageTarget === "documents") {
    try {
      const writeback = await completeEscalationResolutionAtomic(supabase, {
        photographerId: params.photographerId,
        escalationId: row.id,
        learningOutcome,
        reasonCode: row.reason_code,
        actionKey: row.action_key,
        decisionJustification: row.decision_justification,
        weddingId: row.wedding_id,
        questionBody: row.question_body,
        resolutionSummary: params.resolutionSummary,
        photographerReplyRaw: params.photographerReplyRaw,
        clientThreadId: row.thread_id,
      });
      await clearOperatorHoldAfterResolvedEscalation(supabase, params.photographerId, row.id, row.thread_id);
      return {
        ok: true,
        mode: "legacy_atomic",
        writeback,
        learningOutcome,
        escalationId: row.id,
        threadId: row.thread_id,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: { code: "LEGACY_ATOMIC_FAILED", message: msg } };
    }
  }

  const lr = await executeLearningLoopEscalationResolution(supabase, {
    photographerId: params.photographerId,
    escalationId: params.escalationId,
    resolutionSummary: params.resolutionSummary,
    photographerReplyRaw: params.photographerReplyRaw,
    learningOutcome,
  });
  if (!lr.ok) return lr;
  await clearOperatorHoldAfterResolvedEscalation(supabase, params.photographerId, row.id, row.thread_id);
  return {
    ok: true,
    mode: "learning_loop",
    receipt: lr.receipt,
    learningOutcome: lr.learningOutcome,
    escalationId: row.id,
    threadId: row.thread_id,
  };
}
