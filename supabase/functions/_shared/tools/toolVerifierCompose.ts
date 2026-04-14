/**
 * Zod-free verifier result composition for `toolVerifier` and Node replay harnesses (no schema import).
 *
 * **Pre-generation verifier:** populates `verifierStage`, `pipelineHaltsBeforeExternalSend`, and closed
 * `reasonCodes` for orchestrator / QA. Distinct from post-generation output auditors.
 */
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import {
  deriveVerifierStageVerdict,
  pipelineHaltsBeforeExternalSend,
  VERIFIER_REASON_CODES,
  type VerifierReasonCode,
} from "../../../../src/types/verifier.types.ts";
import {
  type VerifierBlockTelemetryAttribution,
  logBlocksByVerifier,
} from "../telemetry/telemetryV315Step115a.ts";
import {
  evaluateVerifierPolicyGate,
  type VerifierPolicyGateInput,
} from "./verifierPolicyGate.ts";

const RULE_ID_BROADCAST = "broadcast_risk_high_blocks_auto" as const;

function withVerifierSurfaceFacts(
  verifierSuccess: boolean,
  facts: Record<string, unknown>,
): Record<string, unknown> {
  const pv = facts.policyVerdict;
  const stage = deriveVerifierStageVerdict(verifierSuccess, pv);
  const codes = facts.reasonCodes;
  const reasonCodes: VerifierReasonCode[] = Array.isArray(codes)
    ? (codes as VerifierReasonCode[])
    : [];
  return {
    ...facts,
    verifierStage: stage,
    pipelineHaltsBeforeExternalSend: pipelineHaltsBeforeExternalSend(stage),
    /** Pre-generation gate only — not the post-generation output auditor. */
    preGenerationVerifier: true,
    outputAuditor: false,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : [VERIFIER_REASON_CODES.SAFE],
  };
}

export type ToolVerifierComposeInput = {
  broadcastRisk: "low" | "medium" | "high" | "unknown";
  requestedExecutionMode: "auto" | "draft_only" | "ask_first" | "forbidden";
  policyGate?: VerifierPolicyGateInput;
  escalation?: Record<string, unknown>;
};

/**
 * Core verifier logic after input validation (broadcast layer + optional policy gate).
 */
export function composeToolVerifierAgentResult(
  d: ToolVerifierComposeInput,
  photographerId: string,
  telemetry?: VerifierBlockTelemetryAttribution,
): AgentResult<Record<string, unknown>> {
  const blockedBroadcast =
    d.broadcastRisk === "high" && d.requestedExecutionMode === "auto";

  if (blockedBroadcast) {
    logBlocksByVerifier({
      metric: "blocks_by_verifier",
      rule_id: RULE_ID_BROADCAST,
      photographer_id: photographerId,
      broadcast_risk: d.broadcastRisk,
      requested_execution_mode: d.requestedExecutionMode,
      thread_id: telemetry?.thread_id ?? null,
      wedding_id: telemetry?.wedding_id ?? null,
      source_event: telemetry?.source_event ?? null,
      risk_class: telemetry?.risk_class ?? d.broadcastRisk,
    });
    return {
      success: false,
      facts: withVerifierSurfaceFacts(false, {
        verifier: "toolVerifier",
        ruleId: RULE_ID_BROADCAST,
        broadcastRisk: d.broadcastRisk,
        requestedExecutionMode: d.requestedExecutionMode,
        photographerId,
        escalation: d.escalation,
        policyVerdict: "hard_block" as const,
        reasonCodes: [VERIFIER_REASON_CODES.BROADCAST_HIGH_BLOCKS_AUTO],
      }),
      confidence: 1,
      error: "broadcast_risk_high_blocks_auto_execution",
    };
  }

  if (d.policyGate === undefined) {
    return {
      success: true,
      facts: withVerifierSurfaceFacts(true, {
        verifier: "toolVerifier",
        ruleId: "broadcast_risk_gate_passed",
        policyGateApplied: false,
        broadcastRisk: d.broadcastRisk,
        requestedExecutionMode: d.requestedExecutionMode,
        photographerId,
        policyVerdict: "allow_auto" as const,
        reasonCodes: [VERIFIER_REASON_CODES.SAFE],
      }),
      confidence: 1,
      error: null,
    };
  }

  const ev = evaluateVerifierPolicyGate(d.policyGate, d.requestedExecutionMode);

  if (ev.outcome === "hard_fail") {
    return {
      success: false,
      facts: withVerifierSurfaceFacts(false, {
        verifier: "toolVerifier",
        ruleId: "verifier_policy_gate_hard_fail",
        broadcastRisk: d.broadcastRisk,
        requestedExecutionMode: d.requestedExecutionMode,
        photographerId,
        policyVerdict: "hard_block" as const,
        reasonCodes: ev.reasonCodes,
        policyGateApplied: true,
        ...(ev.supportingSignals ?? {}),
      }),
      confidence: 1,
      error: ev.errorMessage,
    };
  }

  if (ev.outcome === "coerce") {
    return {
      success: true,
      facts: withVerifierSurfaceFacts(true, {
        verifier: "toolVerifier",
        ruleId: "verifier_policy_gate_coerce",
        broadcastRisk: d.broadcastRisk,
        requestedExecutionMode: d.requestedExecutionMode,
        photographerId,
        policyGateApplied: true,
        policyVerdict: ev.policyVerdict,
        reasonCodes: ev.reasonCodes,
        /**
         * When `verifierStage` is `draft_only`, orchestrator may still **generate a draft**; the pipeline
         * must **halt before** autonomous external send or commit (`pipelineHaltsBeforeExternalSend`).
         */
        pipelineNote:
          ev.policyVerdict === "require_draft_only"
            ? "draft_generation_allowed_external_send_blocked"
            : "human_review_path",
        ...(ev.supportingSignals ?? {}),
      }),
      confidence: 1,
      error: null,
    };
  }

  return {
    success: true,
    facts: withVerifierSurfaceFacts(true, {
      verifier: "toolVerifier",
      ruleId: "verifier_policy_gate_passed",
      broadcastRisk: d.broadcastRisk,
      requestedExecutionMode: d.requestedExecutionMode,
      photographerId,
      policyGateApplied: true,
      policyVerdict: "allow_auto" as const,
      reasonCodes: [VERIFIER_REASON_CODES.SAFE],
      ...(ev.supportingSignals ?? {}),
    }),
    confidence: 1,
    error: null,
  };
}
