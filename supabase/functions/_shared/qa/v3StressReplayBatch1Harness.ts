/**
 * V3 stress replay batch 1 — deterministic evaluation of orchestrator proposals + verifier
 * against real-stress-test-shaped decision points (no DB).
 */
import type {
  BroadcastRiskLevel,
  DecisionAudienceSnapshot,
  InboundSenderAuthoritySnapshot,
  InboundSenderIdentity,
} from "../../../../src/types/decisionContext.types.ts";
import type { ClientOrchestratorExecutionMode } from "../orchestrator/proposeClientOrchestratorCandidateActions.ts";
import { isThreadWeddingIdentityAmbiguous } from "../context/threadWeddingIdentityAmbiguous.ts";
import { detectBankingComplianceOrchestratorException } from "../orchestrator/detectBankingComplianceOrchestratorException.ts";
import { detectVisualAssetVerificationOrchestratorRequest } from "../orchestrator/detectVisualAssetVerificationOrchestratorRequest.ts";
import { detectIdentityEntityRoutingAmbiguity } from "../orchestrator/detectIdentityEntityRoutingAmbiguity.ts";
import { detectAuthorityPolicyRisk } from "../orchestrator/detectAuthorityPolicyRisk.ts";
import {
  verifyMemoryNarrowsPayerOrScopeAuthority,
  type AuthorityMemoryRow,
} from "../orchestrator/detectMultiActorAuthorityRefinement.ts";
import { detectIrregularSettlementOrchestratorRequest } from "../orchestrator/detectIrregularSettlementOrchestratorRequest.ts";
import { detectHighMagnitudeClientConcessionOrchestratorRequest } from "../orchestrator/detectHighMagnitudeClientConcessionOrchestratorRequest.ts";
import { detectSensitivePersonalDocumentOrchestratorRequest } from "../orchestrator/detectSensitivePersonalDocumentOrchestratorRequest.ts";
import { detectStrategicTrustRepairOrchestratorRequest } from "../orchestrator/detectStrategicTrustRepairOrchestratorRequest.ts";
import { detectNonCommercialOrchestratorRisk } from "../orchestrator/detectNonCommercialOrchestratorRisk.ts";
import {
  proposeClientOrchestratorCandidateActions,
  workflowBlocksRoutineClientSendMessage,
  type ClientOrchestratorProposalInput,
} from "../orchestrator/proposeClientOrchestratorCandidateActions.ts";
import { inferV3ThreadWorkflowInboundPatch } from "../workflow/inferV3ThreadWorkflowInboundPatch.ts";
import { mergeV3ThreadWorkflow } from "../workflow/mergeV3ThreadWorkflow.ts";
import { emptyV3ThreadWorkflowV1, type V3ThreadWorkflowV1 } from "../workflow/v3ThreadWorkflowTypes.ts";
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import type { VerifierReasonCode, VerifierStageVerdict } from "../../../../src/types/verifier.types.ts";
import type { WeddingCrmParityHints } from "../context/weddingCrmParityHints.ts";
import {
  type VerifierBlockTelemetryAttribution,
} from "../telemetry/telemetryV315Step115a.ts";
import { composeToolVerifierAgentResult } from "../tools/toolVerifierCompose.ts";
import type { VerifierPolicyGateInput } from "../tools/verifierPolicyGate.ts";

/** Local copy of `clientOrchestratorV1Core` mapping — avoids importing Inngest-backed modules in Vitest. */
export type ClientOrchestratorV1Outcome = "auto" | "draft" | "ask" | "block";

export function buildVerifierPayloadForClientOrchestratorV1Local(
  audience: DecisionAudienceSnapshot,
  requestedExecutionMode: ClientOrchestratorExecutionMode,
  rawMessage: string,
  policyOverrides?: Partial<VerifierPolicyGateInput>,
): unknown {
  const broadcastRisk = audience.broadcastRisk;
  const policyGate: VerifierPolicyGateInput = {
    audience: {
      visibilityClass: audience.visibilityClass,
      clientVisibleForPrivateCommercialRedaction: audience.clientVisibleForPrivateCommercialRedaction,
      broadcastRisk: audience.broadcastRisk,
      recipientCount: audience.recipientCount,
    },
    playbookRules: policyOverrides?.playbookRules ?? [],
    selectedMemoriesSummary: policyOverrides?.selectedMemoriesSummary ?? [],
    globalKnowledgeLoadedCount: policyOverrides?.globalKnowledgeLoadedCount ?? 0,
    retrievalTrace: policyOverrides?.retrievalTrace ?? {
      globalKnowledgeFetch: "skipped_by_gate",
      selectedMemoryIdsResolved: [],
    },
    escalationOpenCount: policyOverrides?.escalationOpenCount ?? 0,
    ...(policyOverrides?.policyEvaluationActionKey !== undefined
      ? { policyEvaluationActionKey: policyOverrides.policyEvaluationActionKey }
      : {}),
  };

  const base: Record<string, unknown> = {
    broadcastRisk,
    requestedExecutionMode,
    policyGate,
  };

  if (broadcastRisk === "high" && requestedExecutionMode === "auto") {
    return {
      ...base,
      escalation: {
        whatWasAsked: rawMessage.trim().slice(0, 500) || "(empty)",
        intendedAction: "Proceed with auto execution for this client message.",
        blockedByDecisionMode: "auto" as const,
        photographerQuestion:
          "High broadcast risk was detected. Approve auto execution or choose a safer mode?",
        answerStorageTarget: "undetermined" as const,
      },
    };
  }
  return base;
}

export function mapClientOrchestratorV1OutcomeLocal(
  verifierPassed: boolean,
  requestedMode: ClientOrchestratorExecutionMode,
  verifierFacts?: Record<string, unknown> | null,
): ClientOrchestratorV1Outcome {
  const pv = verifierFacts?.policyVerdict;
  if (typeof pv === "string") {
    if (verifierPassed && requestedMode === "auto") {
      if (pv === "require_draft_only") return "draft";
      if (pv === "require_ask" || pv === "require_operator_review") return "ask";
    }
    if (!verifierPassed && pv === "hard_block") {
      return "block";
    }
  }
  if (!verifierPassed) return "block";
  if (requestedMode === "forbidden") return "block";
  if (requestedMode === "draft_only") return "draft";
  if (requestedMode === "ask_first") return "ask";
  return "auto";
}

type ParsedVerifierInput = {
  broadcastRisk: "low" | "medium" | "high" | "unknown";
  requestedExecutionMode: ClientOrchestratorExecutionMode;
  policyGate?: VerifierPolicyGateInput;
  escalation?: {
    whatWasAsked: string;
    intendedAction: string;
    blockedByDecisionMode: "auto" | "draft_only" | "ask_first" | "forbidden";
    photographerQuestion: string;
    defaultRecommendation?: string;
    answerStorageTarget:
      | "playbook_rules"
      | "memories"
      | "escalation_requests"
      | "undetermined";
  };
};

/**
 * Mirrors `ToolVerifierInputSchema` + `executeToolVerifier` without importing `schemas.ts`
 * (Deno `npm:zod@4` breaks Node/tsx). Keep aligned with `supabase/functions/_shared/tools/toolVerifier.ts`.
 */
function parseToolVerifierInputReplay(input: unknown): { ok: true; data: ParsedVerifierInput } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Expected object" };
  }
  const o = input as Record<string, unknown>;
  const allowedKeys = new Set(["broadcastRisk", "requestedExecutionMode", "escalation", "policyGate"]);
  for (const k of Object.keys(o)) {
    if (!allowedKeys.has(k)) return { ok: false, error: `Unexpected key: ${k}` };
  }
  const br = o.broadcastRisk;
  const rem = o.requestedExecutionMode;
  const broadcastRisks = new Set(["low", "medium", "high", "unknown"]);
  const modes = new Set(["auto", "draft_only", "ask_first", "forbidden"]);
  if (typeof br !== "string" || !broadcastRisks.has(br)) {
    return { ok: false, error: "Invalid broadcastRisk" };
  }
  if (typeof rem !== "string" || !modes.has(rem)) {
    return { ok: false, error: "Invalid requestedExecutionMode" };
  }
  const blocksAuto = br === "high" && rem === "auto";
  let escalation: ParsedVerifierInput["escalation"];
  if (o.escalation !== undefined) {
    if (typeof o.escalation !== "object" || o.escalation === null) {
      return { ok: false, error: "Invalid escalation" };
    }
    const e = o.escalation as Record<string, unknown>;
    const escKeys = new Set([
      "whatWasAsked",
      "intendedAction",
      "blockedByDecisionMode",
      "photographerQuestion",
      "defaultRecommendation",
      "answerStorageTarget",
    ]);
    for (const k of Object.keys(e)) {
      if (!escKeys.has(k)) return { ok: false, error: `Unexpected escalation key: ${k}` };
    }
    const ws = e.whatWasAsked;
    const ia = e.intendedAction;
    const pq = e.photographerQuestion;
    const bd = e.blockedByDecisionMode;
    const ast = e.answerStorageTarget;
    const targets = new Set(["playbook_rules", "memories", "escalation_requests", "undetermined"]);
    const bdModes = new Set(["auto", "draft_only", "ask_first", "forbidden"]);
    if (typeof ws !== "string" || ws.trim().length < 1) return { ok: false, error: "escalation.whatWasAsked" };
    if (typeof ia !== "string" || ia.trim().length < 1) return { ok: false, error: "escalation.intendedAction" };
    if (typeof pq !== "string" || pq.trim().length < 1) return { ok: false, error: "escalation.photographerQuestion" };
    if (typeof bd !== "string" || !bdModes.has(bd)) return { ok: false, error: "escalation.blockedByDecisionMode" };
    if (typeof ast !== "string" || !targets.has(ast)) return { ok: false, error: "escalation.answerStorageTarget" };
    if (e.defaultRecommendation !== undefined && (typeof e.defaultRecommendation !== "string" || e.defaultRecommendation.trim().length < 1)) {
      return { ok: false, error: "escalation.defaultRecommendation" };
    }
    escalation = {
      whatWasAsked: ws.trim(),
      intendedAction: ia.trim(),
      blockedByDecisionMode: bd as NonNullable<ParsedVerifierInput["escalation"]>["blockedByDecisionMode"],
      photographerQuestion: pq.trim(),
      defaultRecommendation:
        e.defaultRecommendation !== undefined ? String(e.defaultRecommendation).trim() : undefined,
      answerStorageTarget: ast as NonNullable<ParsedVerifierInput["escalation"]>["answerStorageTarget"],
    };
  }
  if (blocksAuto) {
    if (escalation === undefined) {
      return { ok: false, error: "escalation required when high broadcast risk blocks auto" };
    }
    if (escalation.blockedByDecisionMode !== "auto") {
      return { ok: false, error: "escalation.blockedByDecisionMode must be auto when blocking auto" };
    }
  }

  let policyGate: VerifierPolicyGateInput | undefined;
  if (o.policyGate !== undefined) {
    if (typeof o.policyGate !== "object" || o.policyGate === null) {
      return { ok: false, error: "policyGate must be an object when present" };
    }
    policyGate = o.policyGate as VerifierPolicyGateInput;
  }

  return {
    ok: true,
    data: {
      broadcastRisk: br as ParsedVerifierInput["broadcastRisk"],
      requestedExecutionMode: rem as ClientOrchestratorExecutionMode,
      escalation,
      policyGate,
    },
  };
}

/** Same contract as `executeToolVerifier` — used by `npm run v3:stress-replay-batch1` (Node has no `npm:zod@4`). */
export async function executeToolVerifierReplay(
  input: unknown,
  photographerId: string,
  telemetry?: VerifierBlockTelemetryAttribution,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const parsed = parseToolVerifierInputReplay(input);
    if (!parsed.ok) {
      return { success: false, facts: {}, confidence: 0, error: parsed.error };
    }
    const d = parsed.data;
    return composeToolVerifierAgentResult(
      {
        broadcastRisk: d.broadcastRisk,
        requestedExecutionMode: d.requestedExecutionMode,
        policyGate: d.policyGate,
        escalation: d.escalation as Record<string, unknown> | undefined,
      },
      photographerId,
      telemetry,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, facts: {}, confidence: 0, error: message };
  }
}

export type VerifierFn = (
  input: unknown,
  photographerId: string,
  telemetry?: VerifierBlockTelemetryAttribution,
) => Promise<AgentResult<Record<string, unknown>>>;

export type StressReplayGapCategory =
  | "missing_tool"
  | "missing_verifier_rule"
  | "missing_operator_behavior"
  | "missing_pause_state_behavior"
  | "missing_memory_grounding"
  | "missing_attachment_visual_handling"
  | "routing_identity_bug"
  | "none_observed";

export type StressReplayDecisionPoint = {
  id: string;
  stressTest: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  title: string;
  rawMessage: string;
  audience: DecisionAudienceSnapshot;
  requestedExecutionMode: ClientOrchestratorExecutionMode;
  weddingCrmParityHints: WeddingCrmParityHints | null;
  /** What the stress-test doc expects (human judgment / product). */
  expectedProductBehavior: string;
  /** Primary gap if V3 does not match expectation. */
  primaryGapIfUnmet: StressReplayGapCategory;
  /**
   * Optional: explicit workflow snapshot for replay. `undefined` = simulate post-inbound state from
   * `inferV3ThreadWorkflowInboundPatch(rawMessage)`; `null` = no workflow row.
   */
  v3ThreadWorkflowSnapshot?: V3ThreadWorkflowV1 | null;
  /**
   * Optional `candidateWeddingIds` for replay (mirrors DecisionContext). `undefined` = none;
   * set two or more ids to simulate multi-wedding thread links.
   */
  candidateWeddingIds?: string[] | null;
  /**
   * Simulates verified ingress sender (triage / orchestrator event); IE2 B2B domain without body `From …` lines.
   */
  inboundSenderIdentity?: InboundSenderIdentity | null;
  /**
   * Simulates `DecisionContext.inboundSenderAuthority`. When omitted, replay uses {@link HARNESS_DEFAULT_SENDER_AUTHORITY}
   * (`client_primary`) so legacy batch DPs are not tripped by Phase-1 commercial authority gating.
   */
  inboundSenderAuthority?: InboundSenderAuthoritySnapshot;
  /**
   * Mirrors production `ClientOrchestratorProposalInput.selectedMemorySummaries` for AP1
   * (`detectAuthorityPolicyRisk` → multi-actor verify-note scan). Omit → `[]` (legacy batch points unchanged).
   */
  selectedMemorySummaries?: readonly AuthorityMemoryRow[];
};

export function minimalAudience(overrides: Partial<DecisionAudienceSnapshot> = {}): DecisionAudienceSnapshot {
  return {
    threadParticipants: [],
    agencyCcLock: overrides.agencyCcLock ?? false,
    broadcastRisk: overrides.broadcastRisk ?? "low",
    recipientCount: overrides.recipientCount ?? 2,
    visibilityClass: overrides.visibilityClass ?? "client_visible",
    clientVisibleForPrivateCommercialRedaction:
      overrides.clientVisibleForPrivateCommercialRedaction ?? true,
    approvalContactPersonIds: overrides.approvalContactPersonIds ?? [],
    ...overrides,
  };
}

/** Default sender for batch1 replay — couple-side unless a DP overrides (e.g. vendor AP1 proof). */
export const HARNESS_DEFAULT_SENDER_AUTHORITY: InboundSenderAuthoritySnapshot = {
  bucket: "client_primary",
  personId: "00000000-0000-4000-8000-0000000000e1",
  isApprovalContact: false,
  source: "thread_sender",
};

const FAKE_WEDDING = "00000000-0000-4000-8000-0000000000a1";
/** Second wedding id — dual-wedding / identity replay only. */
const FAKE_WEDDING_B = "00000000-0000-4000-8000-0000000000d4";
const FAKE_THREAD = "00000000-0000-4000-8000-0000000000b2";
const FAKE_PHOTOGRAPHER = "00000000-0000-4000-8000-0000000000c3";

/** Batch-1: planner/venue sender + approval contact on thread (non-sender) for multi-actor signer loop-in. */
export function audiencePlannerWithApprovalContactNonSender(): DecisionAudienceSnapshot {
  const approverId = "00000000-0000-4000-8000-0000000000ac";
  const plannerSenderId = "00000000-0000-4000-8000-0000000000pl";
  return minimalAudience({
    recipientCount: 3,
    approvalContactPersonIds: [approverId],
    threadParticipants: [
      {
        id: "00000000-0000-4000-8000-000000000101",
        person_id: plannerSenderId,
        thread_id: FAKE_THREAD,
        visibility_role: "to",
        is_cc: false,
        is_recipient: true,
        is_sender: true,
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        person_id: approverId,
        thread_id: FAKE_THREAD,
        visibility_role: "cc",
        is_cc: true,
        is_recipient: true,
        is_sender: false,
      },
    ],
  });
}

function simulatedV3WorkflowAfterInbound(rawMessage: string): V3ThreadWorkflowV1 {
  const patch = inferV3ThreadWorkflowInboundPatch(rawMessage);
  return mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), patch);
}

export function buildProposalInput(dp: StressReplayDecisionPoint): ClientOrchestratorProposalInput {
  const wf =
    dp.v3ThreadWorkflowSnapshot === null
      ? null
      : (dp.v3ThreadWorkflowSnapshot ?? simulatedV3WorkflowAfterInbound(dp.rawMessage));
  return {
    audience: dp.audience,
    playbookRules: [],
    selectedMemoriesCount: 0,
    globalKnowledgeCount: 0,
    escalationOpenCount: 0,
    weddingId: FAKE_WEDDING,
    threadId: FAKE_THREAD,
    replyChannel: "email",
    rawMessage: dp.rawMessage,
    requestedExecutionMode: dp.requestedExecutionMode,
    threadDraftsSummary: null,
    weddingCrmParityHints: dp.weddingCrmParityHints,
    v3ThreadWorkflow: wf,
    candidateWeddingIds: dp.candidateWeddingIds === null || dp.candidateWeddingIds === undefined
      ? []
      : dp.candidateWeddingIds,
    inboundSenderIdentity: dp.inboundSenderIdentity ?? null,
    inboundSenderAuthority: dp.inboundSenderAuthority ?? HARNESS_DEFAULT_SENDER_AUTHORITY,
    selectedMemorySummaries: dp.selectedMemorySummaries ?? [],
  };
}

export type StressReplayEvalResult = {
  decisionPoint: StressReplayDecisionPoint;
  proposalFamilies: string[];
  operatorRoutingProposed: boolean;
  verifierSuccess: boolean;
  /** Pre-generation verifier surface (from `executeToolVerifier` facts). */
  verifierStage?: VerifierStageVerdict;
  verifierReasonCodes?: VerifierReasonCode[];
  orchestratorOutcome: ClientOrchestratorV1Outcome;
  /** True when durable V3 workflow state blocks routine `send_message` draftability (timeline / wire / stalled windows). */
  workflowRoutineDraftSuppressed: boolean;
  /** True when `thread_weddings` lists multiple candidate weddings (identity ambiguity). */
  multiWeddingIdentityAmbiguous: boolean;
  /** True when irregular settlement / tax-avoidance routing detector matched (before BC). */
  irregularSettlementDetected: boolean;
  /** True when banking/compliance exception detector matched (before NC). */
  bankingComplianceExceptionDetected: boolean;
  /** True when proposals include compliance library attach or missing-collect operator path. */
  complianceAssetLibraryAttachProposed: boolean;
  /** True when visual/attachment verification detector matched (after BC, before NC). */
  visualAssetVerificationDetected: boolean;
  /** True when sensitive identity-document / government-ID handling detector matched (after VAV, before AP1). */
  sensitivePersonalDocumentDetected: boolean;
  /** True when identity/entity Phase 2 detector matched (B2B / multi-booking text; not Phase 1 DB). */
  identityEntityPhase2Detected: boolean;
  /** True when Phase-1 authority policy detector matched (commercial / ambiguous approval). */
  authorityPolicyDetected: boolean;
  /**
   * True when AP1 hit is `multi_actor_payer_scope_spend_signer` and loaded memories matched
   * {@link verifyMemoryNarrowsPayerOrScopeAuthority} (production verify-note path).
   */
  authorityPolicyVerifyNoteMemoryMatched: boolean;
  /** True when high-magnitude client/payer concession detector matched (after AP1 in orchestrator). */
  highMagnitudeClientConcessionDetected: boolean;
  /** True when strategic trust-repair / contradiction-expectation detector matched (after CCM, before NC). */
  strategicTrustRepairDetected: boolean;
  /** True when non-commercial (legal / PR / artistic dispute) detector matched (proposal chain after STR). */
  nonCommercialDetected: boolean;
  /** Observed deterministic classification for the report. */
  resultClass:
    | "safe_draft_path"
    | "blocked_or_gated"
    | "operator_surface"
    | "workflow_suppresses_routine_send"
    | "identity_ambiguity_safe"
    | "identity_entity_routing_safe"
    | "irregular_settlement_safe"
    | "banking_compliance_exception_safe"
    | "visual_asset_verification_safe"
    | "sensitive_identity_document_safe"
    | "authority_policy_safe"
    | "high_magnitude_client_concession_safe"
    | "strategic_trust_repair_safe"
    | "non_commercial_escalation_safe";
};

function deriveResultClass(
  verifierSuccess: boolean,
  outcome: ClientOrchestratorV1Outcome,
  operatorRouting: boolean,
  workflowRoutineDraftSuppressed: boolean,
  multiWeddingIdentityAmbiguous: boolean,
  irregularSettlementDetected: boolean,
  bankingComplianceExceptionDetected: boolean,
  visualAssetVerificationDetected: boolean,
  sensitivePersonalDocumentDetected: boolean,
  authorityPolicyDetected: boolean,
  highMagnitudeClientConcessionDetected: boolean,
  strategicTrustRepairDetected: boolean,
  nonCommercialDetected: boolean,
  identityEntityPhase2Detected: boolean,
): StressReplayEvalResult["resultClass"] {
  if (!verifierSuccess || outcome === "block") return "blocked_or_gated";
  if (workflowRoutineDraftSuppressed && outcome === "draft") {
    return "workflow_suppresses_routine_send";
  }
  if (irregularSettlementDetected && outcome === "draft") {
    return "irregular_settlement_safe";
  }
  if (bankingComplianceExceptionDetected && outcome === "draft") {
    return "banking_compliance_exception_safe";
  }
  if (visualAssetVerificationDetected && outcome === "draft") {
    return "visual_asset_verification_safe";
  }
  if (sensitivePersonalDocumentDetected && outcome === "draft") {
    return "sensitive_identity_document_safe";
  }
  if (authorityPolicyDetected && outcome === "draft") {
    return "authority_policy_safe";
  }
  if (highMagnitudeClientConcessionDetected && outcome === "draft") {
    return "high_magnitude_client_concession_safe";
  }
  if (strategicTrustRepairDetected && outcome === "draft") {
    return "strategic_trust_repair_safe";
  }
  if (nonCommercialDetected && outcome === "draft") {
    return "non_commercial_escalation_safe";
  }
  if (identityEntityPhase2Detected && outcome === "draft") {
    return "identity_entity_routing_safe";
  }
  if (multiWeddingIdentityAmbiguous && outcome === "draft") {
    return "identity_ambiguity_safe";
  }
  if (operatorRouting) return "operator_surface";
  return "safe_draft_path";
}

export async function evaluateDecisionPoint(
  dp: StressReplayDecisionPoint,
  verifier: VerifierFn = executeToolVerifierReplay,
): Promise<StressReplayEvalResult> {
  const input = buildProposalInput(dp);
  const proposals = proposeClientOrchestratorCandidateActions(input);
  const families = proposals.map((p) => p.action_family);
  const operatorRouting = proposals.some((p) => p.action_family === "operator_notification_routing");
  const complianceAssetLibraryAttachProposed = proposals.some(
    (p) =>
      p.action_key === "v3_compliance_asset_library_attach" ||
      p.action_key === "v3_compliance_asset_library_missing_collect",
  );
  const workflowRoutineDraftSuppressed = workflowBlocksRoutineClientSendMessage(
    input.v3ThreadWorkflow ?? null,
  );
  const multiWeddingIdentityAmbiguous = isThreadWeddingIdentityAmbiguous({
    threadId: input.threadId ?? null,
    candidateWeddingIds: input.candidateWeddingIds,
  });
  const irregularSettlementDetected = detectIrregularSettlementOrchestratorRequest(
    input.rawMessage,
    input.threadContextSnippet,
  ).hit;
  const bankingComplianceExceptionDetected = detectBankingComplianceOrchestratorException(
    input.rawMessage,
    input.threadContextSnippet,
  ).hit;
  const visualAssetVerificationDetected = detectVisualAssetVerificationOrchestratorRequest(
    input.rawMessage,
    input.threadContextSnippet,
  ).hit;
  const sensitivePersonalDocumentDetected = detectSensitivePersonalDocumentOrchestratorRequest(
    input.rawMessage,
    input.threadContextSnippet,
  ).hit;
  const identityEntityPhase2Detected = detectIdentityEntityRoutingAmbiguity({
    rawMessage: input.rawMessage,
    threadContextSnippet: input.threadContextSnippet,
    threadId: input.threadId ?? null,
    candidateWeddingIds: input.candidateWeddingIds,
    inboundSenderEmail: input.inboundSenderIdentity?.email ?? undefined,
  }).hit;

  const memoryRows = dp.selectedMemorySummaries ?? [];
  const authorityPolicyDetection = detectAuthorityPolicyRisk({
    rawMessage: input.rawMessage,
    threadContextSnippet: input.threadContextSnippet,
    authority: input.inboundSenderAuthority ?? HARNESS_DEFAULT_SENDER_AUTHORITY,
    selectedMemorySummaries: memoryRows,
    audience: dp.audience,
  });
  const authorityPolicyDetected = authorityPolicyDetection.hit;
  let authorityPolicyVerifyNoteMemoryMatched = false;
  if (authorityPolicyDetection.hit) {
    authorityPolicyVerifyNoteMemoryMatched =
      authorityPolicyDetection.primaryClass === "multi_actor_payer_scope_spend_signer" &&
      verifyMemoryNarrowsPayerOrScopeAuthority(memoryRows);
  }
  const highMagnitudeClientConcessionDetected = detectHighMagnitudeClientConcessionOrchestratorRequest({
    rawMessage: input.rawMessage,
    threadContextSnippet: input.threadContextSnippet,
    authority: input.inboundSenderAuthority ?? HARNESS_DEFAULT_SENDER_AUTHORITY,
  }).hit;
  const strategicTrustRepairDetected = detectStrategicTrustRepairOrchestratorRequest(
    input.rawMessage,
    input.threadContextSnippet,
  ).hit;
  const nonCommercialDetected = detectNonCommercialOrchestratorRisk(
    input.rawMessage,
    input.threadContextSnippet,
  ).hit;

  const payload = buildVerifierPayloadForClientOrchestratorV1Local(
    dp.audience,
    dp.requestedExecutionMode,
    dp.rawMessage,
  );
  const verifierResult = await verifier(payload, FAKE_PHOTOGRAPHER);
  const outcome = mapClientOrchestratorV1OutcomeLocal(
    verifierResult.success,
    dp.requestedExecutionMode,
    verifierResult.facts,
  );

  return {
    decisionPoint: dp,
    proposalFamilies: families,
    operatorRoutingProposed: operatorRouting,
    verifierSuccess: verifierResult.success,
    verifierStage:
      typeof verifierResult.facts.verifierStage === "string"
        ? (verifierResult.facts.verifierStage as VerifierStageVerdict)
        : undefined,
    verifierReasonCodes: Array.isArray(verifierResult.facts.reasonCodes)
      ? (verifierResult.facts.reasonCodes as VerifierReasonCode[])
      : undefined,
    orchestratorOutcome: outcome,
    workflowRoutineDraftSuppressed,
    multiWeddingIdentityAmbiguous,
    irregularSettlementDetected,
    bankingComplianceExceptionDetected,
    complianceAssetLibraryAttachProposed,
    visualAssetVerificationDetected,
    sensitivePersonalDocumentDetected,
    identityEntityPhase2Detected,
    authorityPolicyDetected,
    authorityPolicyVerifyNoteMemoryMatched,
    highMagnitudeClientConcessionDetected,
    strategicTrustRepairDetected,
    nonCommercialDetected,
    resultClass: deriveResultClass(
      verifierResult.success,
      outcome,
      operatorRouting,
      workflowRoutineDraftSuppressed,
      multiWeddingIdentityAmbiguous,
      irregularSettlementDetected,
      bankingComplianceExceptionDetected,
      visualAssetVerificationDetected,
      sensitivePersonalDocumentDetected,
      authorityPolicyDetected,
      highMagnitudeClientConcessionDetected,
      strategicTrustRepairDetected,
      nonCommercialDetected,
      identityEntityPhase2Detected,
    ),
  };
}

/** Four stress tests × critical decision points from REAL_CONVERSATION_STRESS_TEST_PLAN + source notes. */
export const BATCH1_DECISION_POINTS: StressReplayDecisionPoint[] = [
  // ── Stress test 1 ──
  {
    id: "st1-b2b-indalo-preflight",
    stressTest: 1,
    title: "Entity: indalo.travel + safari / B2B (not new lead)",
    rawMessage:
      "Hi Danilo, following up on Dana & Matt safari package PR timelines.",
    inboundSenderIdentity: {
      email: "erin@indalo.travel",
      displayName: null,
      domain: "indalo.travel",
    },
    audience: minimalAudience({ recipientCount: 3 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Router links domain + context to Dana & Matt wedding; not a cold corporate lead.",
    primaryGapIfUnmet: "routing_identity_bug",
  },
  {
    id: "st1-vendor-authority-bulk-discount",
    stressTest: 1,
    title: "Authority: vendor asks bulk discount — AP1 blocks routine safe draft path",
    rawMessage:
      "Can we get a bulk discount for 500–800 extra photos? And can black and white be reversed to color for free?",
    inboundSenderAuthority: {
      bucket: "vendor",
      personId: "00000000-0000-4000-8000-0000000000f9",
      isApprovalContact: false,
      source: "thread_sender",
    },
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Phase-1 authority policy escalates commercial-shaped asks from non-client/planner/payer senders.",
    primaryGapIfUnmet: "routing_identity_bug",
  },
  {
    id: "st1-planner-timeline-reduction-signer-loopin",
    stressTest: 1,
    title: "Multi-actor: B2B venue/planner cuts day-of portrait time; approval contact on thread (non-sender)",
    rawMessage:
      "From the venue coordinator side: we'd like to cut the couple portrait block from 40 minutes to 15 before ceremony — please confirm for your team.",
    inboundSenderIdentity: {
      email: "events@luxvenue.test",
      displayName: "LuxVenue Coordinator",
      domain: "luxvenue.test",
    },
    inboundSenderAuthority: {
      bucket: "planner",
      personId: "00000000-0000-4000-8000-0000000000ven",
      isApprovalContact: false,
      source: "thread_sender",
    },
    audience: audiencePlannerWithApprovalContactNonSender(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "AP1 multi-actor timeline reduction: signer/approval loop-in — same path production evaluates with audience + memories (memories empty here by default).",
    primaryGapIfUnmet: "missing_memory_grounding",
  },
  {
    id: "st1-payer-addon-verify-note-memory",
    stressTest: 1,
    title: "Authority-via-memory: payer add-on / fee confirm + verify_note narrows binding (MOB slice)",
    rawMessage:
      "Please add two extra hours of coverage and confirm the $800 add-on fee on the invoice today so we can pay.",
    inboundSenderAuthority: {
      bucket: "payer",
      personId: "00000000-0000-4000-8000-0000000000mob",
      isApprovalContact: false,
      source: "thread_sender",
    },
    selectedMemorySummaries: [
      {
        type: "verify_note",
        title: "MOB / payer authority boundary",
        summary:
          "Ops verify_note: payer status does not authorize add-on hours or fee confirmation without a change order signed by the couple (approval contact).",
      },
    ],
    audience: minimalAudience({ recipientCount: 2 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Multi-actor payer scope/spend AP1; loaded summaries must flow through detectAuthorityPolicyRisk like production (verify-note scan).",
    primaryGapIfUnmet: "missing_memory_grounding",
  },
  {
    id: "st1-payer-rush-fee-budget-cap-memory",
    stressTest: 1,
    title: "Authority-via-memory: rush fee confirm + file note caps spend approval to couple",
    rawMessage:
      "Please confirm the $950 rush editing add-on on the next invoice — we need it for the parent album deadline.",
    inboundSenderAuthority: {
      bucket: "payer",
      personId: "00000000-0000-4000-8000-0000000000pay2",
      isApprovalContact: false,
      source: "thread_sender",
    },
    selectedMemorySummaries: [
      {
        type: "verify_note",
        title: "Spend / authority cap",
        summary:
          "Wedding file: any fee or scope increase above $500 must be approved by the bride (approval contact) — payer emails alone do not bind pricing.",
      },
    ],
    audience: minimalAudience({ recipientCount: 2 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Same AP1 payer-scope path with budget/authority-cap grounding from stored memory (real-thread MOB/payer constraint).",
    primaryGapIfUnmet: "missing_memory_grounding",
  },
  {
    id: "st1-bulk-discount",
    stressTest: 1,
    title: "Commercial: bulk discount + B&W reversal (must halt)",
    rawMessage:
      "Can we get a bulk discount for 500–800 extra photos? And can black and white be reversed to color for free?",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "No autonomous negotiation; operator / escalation — deterministic auditor blocks bad commitments.",
    primaryGapIfUnmet: "missing_verifier_rule",
  },
  {
    id: "st1-artistic-critique",
    stressTest: 1,
    title: "Artistic critique: colors fake, hair yellow, weird crops",
    rawMessage:
      "The wedding day colors look fake, my hair looks yellow in the photos, and some crops feel weird.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Immediate escalation — AI must not defend or promise re-edits without photographer.",
    primaryGapIfUnmet: "missing_operator_behavior",
  },
  {
    id: "st1-wire-chase",
    stressTest: 1,
    title: "Wire follow-up: client says wiring today",
    rawMessage: "I am sending the wire transfer today for the remaining balance.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "schedule_follow_up / payment check if unpaid after policy delay — not in V3 orchestrator proposals today.",
    primaryGapIfUnmet: "missing_tool",
  },
  // ── Stress test 2 ──
  {
    id: "st2-dual-wedding-same-thread",
    stressTest: 2,
    title: "Dual wedding: Cambodia + Italy same thread",
    rawMessage:
      "For our Cambodia wedding in April vs the Italy wedding in June, can you confirm which invoice this deposit applies to?",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Explicit disambiguation in every draft; candidateWeddingIds / thread_weddings — not only thread_id.",
    primaryGapIfUnmet: "routing_identity_bug",
    candidateWeddingIds: [FAKE_WEDDING, FAKE_WEDDING_B],
  },
  {
    id: "st2-text-dual-booking-no-thread-weddings",
    stressTest: 2,
    title: "Dual booking text only (single CRM wedding link — Phase 2)",
    rawMessage:
      "For our Cambodia wedding in April vs the Italy wedding in June, can you confirm which invoice this deposit applies to?",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Same contrast as dual-wedding stress, but only one wedding in thread_weddings — Phase 2 text cues should still block routine send.",
    primaryGapIfUnmet: "routing_identity_bug",
    candidateWeddingIds: [FAKE_WEDDING],
  },
  {
    id: "st2-timeline-whatsapp",
    stressTest: 2,
    title: "Timeline already on WhatsApp (channel silo)",
    rawMessage: "I already sent the full timeline to Danilo on WhatsApp last week.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Mute/stop asking for timeline when human marks received — dashboard override.",
    primaryGapIfUnmet: "missing_pause_state_behavior",
  },
  {
    id: "st2-banking-serbia",
    stressTest: 2,
    title: "Banking: Serbia blocked — US/UK account request",
    rawMessage:
      "My bank will not transfer to Serbia. Can you send a US dollar account instead? Or UK?",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "No invented account numbers; escalate — commercial auditor + operator.",
    primaryGapIfUnmet: "missing_verifier_rule",
  },
  // ── Stress test 6 ──
  {
    id: "st6-broadcast-vendors",
    stressTest: 6,
    title: "Broadcast thank-you to ~20 vendors (reply-all trap)",
    rawMessage: "HUGE THANKS to everyone who made K&N's day magical — florals, band, catering...",
    audience: minimalAudience({
      broadcastRisk: "high",
      recipientCount: 22,
    }),
    requestedExecutionMode: "auto",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "High broadcast risk → block auto; operator routing; no reply-all auto-send.",
    primaryGapIfUnmet: "none_observed",
  },
  {
    id: "st6-compassion-pause",
    stressTest: 6,
    title: "Compassion pause: housing crisis",
    rawMessage:
      "Karissa here — we are homeless right now and under a lot of stress about housing.",
    audience: minimalAudience(),
    requestedExecutionMode: "auto",
    weddingCrmParityHints: {
      weddingId: FAKE_WEDDING,
      balanceDue: null,
      strategicPause: false,
      compassionPause: true,
      packageName: null,
      stage: "booked",
    },
    expectedProductBehavior:
      "Freeze automated sales/follow-ups on wedding — compassion_pause downgrades send_message to ask.",
    primaryGapIfUnmet: "missing_pause_state_behavior",
  },
  {
    id: "st6-album-mockup-typo",
    stressTest: 6,
    title: "Visual mockup typo (AI cannot see PDF)",
    rawMessage:
      "Attached is the album cover mockup PDF — please confirm the spelling Karissa before we print.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Asset verification / approval hold — attachment safety slice 2 reduces blind trust in body text only.",
    primaryGapIfUnmet: "missing_attachment_visual_handling",
  },
  // ── Stress test 8 ──
  {
    id: "st8-pr-crisis-wedluxe",
    stressTest: 8,
    title: "PR crisis: WedLuxe, angry vendors, missing credits",
    rawMessage:
      "I am so angry — WedLuxe published without permission and florists are furious about missing credits.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Urgent operator / dispute workflow — not generic apology draft.",
    primaryGapIfUnmet: "missing_operator_behavior",
  },
  {
    id: "st8-nda-vs-insurance",
    stressTest: 8,
    title: "Compliance: NDA vs £10m PL insurance",
    rawMessage:
      "Please sign the NDA in DocuSign and send your £10m Public Liability Insurance certificate.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Compliance asset tool for insurance PDF; escalate NDA signature — not autonomous.",
    primaryGapIfUnmet: "missing_tool",
  },
  {
    id: "st8-stalled-comms",
    stressTest: 8,
    title: "Stalled communication: client did not receive prior email",
    rawMessage:
      "Following up — I never heard back on my question from March about the rehearsal time.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Background worker nudge if question unanswered — separate from orchestrator single-turn.",
    primaryGapIfUnmet: "missing_tool",
  },
];

export async function runBatch1Harness(): Promise<StressReplayEvalResult[]> {
  const out: StressReplayEvalResult[] = [];
  for (const dp of BATCH1_DECISION_POINTS) {
    out.push(await evaluateDecisionPoint(dp));
  }
  return out;
}

export { FAKE_PHOTOGRAPHER, FAKE_WEDDING, FAKE_WEDDING_B };
