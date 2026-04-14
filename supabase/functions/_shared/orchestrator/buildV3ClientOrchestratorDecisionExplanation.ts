/**
 * Deterministic V3 decision explainability — structured facts from `executeClientOrchestratorV1` runtime only.
 * No new inference; does not widen persona inputs.
 */
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import type {
  OrchestratorContextInjection,
  OrchestratorDraftAttemptResult,
  OrchestratorEscalationArtifactResult,
  OrchestratorProposalCandidate,
  V3ClientOrchestratorDecisionExplanation,
} from "../../../../src/types/decisionContext.types.ts";
import {
  V3_CLIENT_ORCHESTRATOR_DECISION_EXPLANATION_SCHEMA_VERSION,
} from "../../../../src/types/decisionContext.types.ts";
import {
  PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_CONFIRM,
  PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_NOT_LISTED,
  PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM,
  PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_NOT_LISTED,
} from "./buildOrchestratorSupportingContextInjection.ts";
import { pickEscalationContextCandidate } from "./buildOrchestratorEscalationArtifact.ts";
import type { OrchestratorHeavyContextLayers } from "./clientOrchestratorV1Core.ts";
import { workflowBlocksRoutineClientSendMessage } from "./proposeClientOrchestratorCandidateActions.ts";
import { resolveVerifierPolicyEvaluationActionKey } from "../tools/verifierPolicyGate.ts";

export type ClientOrchestratorV1ExecutionMode =
  | "auto"
  | "draft_only"
  | "ask_first"
  | "forbidden";

export type ClientOrchestratorV1Outcome = "auto" | "draft" | "ask" | "block";

export type PersonaOutputAuditorSummaryForExplanation =
  | { ran: false; reason?: string }
  | { ran: true; passed: true; draftId: string }
  | {
      ran: true;
      passed: false;
      draftId: string;
      violations?: string[];
      escalationId?: string | null;
    };

const MAX_SUMMARY_LINES = 12;
const MAX_SUMMARY_LINE_CHARS = 200;

function truncateLine(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function parseVerifierFacts(facts: Record<string, unknown> | undefined | null): {
  verifierStage: string | null;
  policyVerdict: string | null;
  reasonCodes: string[];
  pipelineHaltsBeforeExternalSend: boolean | null;
  policyGateApplied: boolean | null;
  ruleId: string | null;
  policyEvaluationActionKey: string | null;
  mergedPlaybookDecisionModeFromRelevantRules: "draft_only" | "ask_first" | "forbidden" | null;
} {
  if (!facts || typeof facts !== "object") {
    return {
      verifierStage: null,
      policyVerdict: null,
      reasonCodes: [],
      pipelineHaltsBeforeExternalSend: null,
      policyGateApplied: null,
      ruleId: null,
      policyEvaluationActionKey: null,
      mergedPlaybookDecisionModeFromRelevantRules: null,
    };
  }
  const rc = Array.isArray(facts.reasonCodes)
    ? (facts.reasonCodes as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const merged = facts.mergedPlaybookDecisionModeFromRelevantRules;
  const mergedOk =
    merged === "draft_only" || merged === "ask_first" || merged === "forbidden" ? merged : null;
  return {
    verifierStage: typeof facts.verifierStage === "string" ? facts.verifierStage : null,
    policyVerdict: typeof facts.policyVerdict === "string" ? facts.policyVerdict : null,
    reasonCodes: rc,
    pipelineHaltsBeforeExternalSend:
      typeof facts.pipelineHaltsBeforeExternalSend === "boolean"
        ? facts.pipelineHaltsBeforeExternalSend
        : null,
    policyGateApplied: typeof facts.policyGateApplied === "boolean" ? facts.policyGateApplied : null,
    ruleId: typeof facts.ruleId === "string" ? facts.ruleId : null,
    policyEvaluationActionKey:
      typeof facts.policyEvaluationActionKey === "string" ? facts.policyEvaluationActionKey : null,
    mergedPlaybookDecisionModeFromRelevantRules: mergedOk,
  };
}

/** Baseline reply path: `action_key === "send_message"` only (not AP1 clarification / other variants). */
function routineBaselineSendMessageCandidate(
  proposals: OrchestratorProposalCandidate[],
): { actionKey: string; likelyOutcome: OrchestratorProposalCandidate["likely_outcome"] } | null {
  const p = proposals.find(
    (x) =>
      x.action_family === "send_message" &&
      x.action_key === "send_message" &&
      x.likely_outcome !== "block",
  );
  return p ? { actionKey: p.action_key, likelyOutcome: p.likely_outcome } : null;
}

function selectionSource(
  draftAttempt: OrchestratorDraftAttemptResult,
  escalationAttempt: OrchestratorEscalationArtifactResult,
  chosen: OrchestratorProposalCandidate | null,
): V3ClientOrchestratorDecisionExplanation["chosenPath"]["selectionSource"] {
  if (!chosen) return null;
  if (draftAttempt.chosenCandidate?.id === chosen.id) return "draft_attempt";
  if (escalationAttempt.chosenCandidateForEscalation?.id === chosen.id) return "escalation_artifact";
  return "pick_escalation_context_fallback";
}

function extractRiskSignals(
  c: OrchestratorProposalCandidate | null,
): V3ClientOrchestratorDecisionExplanation["riskSignals"] {
  if (!c) return {};
  const o: V3ClientOrchestratorDecisionExplanation["riskSignals"] = {};
  if (c.risk_class && c.escalation_reason_code) {
    o.nonCommercial = { riskClass: c.risk_class, reasonCode: c.escalation_reason_code };
  }
  if (c.banking_compliance_class && c.banking_compliance_reason_code) {
    o.bankingCompliance = { class: c.banking_compliance_class, reasonCode: c.banking_compliance_reason_code };
  }
  if (c.visual_asset_verification_class && c.visual_asset_verification_reason_code) {
    o.visualAssetVerification = {
      class: c.visual_asset_verification_class,
      reasonCode: c.visual_asset_verification_reason_code,
    };
  }
  if (c.identity_entity_phase2_class && c.identity_entity_phase2_reason_code) {
    o.identityEntityPhase2 = {
      class: c.identity_entity_phase2_class,
      reasonCode: c.identity_entity_phase2_reason_code,
    };
  }
  if (c.authority_policy_class && c.authority_policy_reason_code) {
    o.authorityPolicy = { class: c.authority_policy_class, reasonCode: c.authority_policy_reason_code };
  }
  if (c.irregular_settlement_class && c.irregular_settlement_reason_code) {
    o.irregularSettlement = {
      class: c.irregular_settlement_class,
      reasonCode: c.irregular_settlement_reason_code,
    };
  }
  if (c.high_magnitude_client_concession_class && c.high_magnitude_client_concession_reason_code) {
    o.highMagnitudeClientConcession = {
      class: c.high_magnitude_client_concession_class,
      reasonCode: c.high_magnitude_client_concession_reason_code,
    };
  }
  if (c.sensitive_personal_document_class && c.sensitive_personal_document_reason_code) {
    o.sensitivePersonalDocument = {
      class: c.sensitive_personal_document_class,
      reasonCode: c.sensitive_personal_document_reason_code,
    };
  }
  if (c.strategic_trust_repair_class && c.strategic_trust_repair_reason_code) {
    o.strategicTrustRepair = {
      class: c.strategic_trust_repair_class,
      reasonCode: c.strategic_trust_repair_reason_code,
    };
  }
  return o;
}

function packageInclusionHintsFromInjection(constraints: string[]): ("travel" | "second_shooter")[] {
  const joined = constraints.join("\n");
  const out: ("travel" | "second_shooter")[] = [];
  if (
    joined.includes(PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM) ||
    joined.includes(PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_NOT_LISTED)
  ) {
    out.push("travel");
  }
  if (
    joined.includes(PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_CONFIRM) ||
    joined.includes(PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_NOT_LISTED)
  ) {
    out.push("second_shooter");
  }
  return out;
}

function buildWorkflowNote(heavy: OrchestratorHeavyContextLayers): string | null {
  const wf = heavy.v3ThreadWorkflow;
  if (!wf) return null;
  if (!workflowBlocksRoutineClientSendMessage(wf)) return null;
  const parts: string[] = [];
  if (wf.timeline?.suppressed === true) {
    parts.push(`timeline_suppressed:${wf.timeline.received_channel ?? "unknown"}`);
  }
  if (wf.payment_wire?.chase_due_at) parts.push("payment_wire_chase_due");
  if (wf.stalled_inquiry?.nudge_due_at) parts.push("stalled_inquiry_nudge_due");
  return parts.length > 0 ? parts.join(";") : "workflow_suppresses_routine_send";
}

function resolveChosenCandidate(
  draftAttempt: OrchestratorDraftAttemptResult,
  escalationAttempt: OrchestratorEscalationArtifactResult,
  proposedActions: OrchestratorProposalCandidate[],
): OrchestratorProposalCandidate | null {
  return (
    draftAttempt.chosenCandidate ??
    escalationAttempt.chosenCandidateForEscalation ??
    pickEscalationContextCandidate(proposedActions)
  );
}

function buildSummaryLines(
  input: Omit<V3ClientOrchestratorDecisionExplanation, "summaryLines" | "schemaVersion">,
): string[] {
  const lines: string[] = [];
  lines.push(
    truncateLine(
      `Outcome ${input.outcome} (requested ${input.requestedExecutionMode}) — verifier ${input.verifier.verifierStage ?? "?"} / ${input.verifier.policyVerdict ?? "?"}`,
      MAX_SUMMARY_LINE_CHARS,
    ),
  );
  if (input.verifier.reasonCodes.length > 0) {
    lines.push(truncateLine(`Verifier reasons: ${input.verifier.reasonCodes.join(", ")}`, MAX_SUMMARY_LINE_CHARS));
  }
  lines.push(
    truncateLine(
      `Chosen: ${input.chosenPath.actionKey ?? "(none)"} (${input.chosenPath.selectionSource ?? "?"})`,
      MAX_SUMMARY_LINE_CHARS,
    ),
  );
  if (input.chosenPath.routineBaselineSendMessageCandidate && input.chosenPath.chosenCandidateId) {
    const r = input.chosenPath.routineBaselineSendMessageCandidate;
    lines.push(
      truncateLine(
        `Baseline send_message candidate: ${r.actionKey} (${r.likelyOutcome}) — chosen path may differ (draft/escalation/clarification).`,
        MAX_SUMMARY_LINE_CHARS,
      ),
    );
  }
  lines.push(
    truncateLine(
      `Authority: ${input.authority.bucket}${input.authority.isApprovalContact ? ", approval_contact" : ""} (${input.authority.source})`,
      MAX_SUMMARY_LINE_CHARS,
    ),
  );
  lines.push(
    truncateLine(
      `Audience: ${input.audience.visibilityClass}; private_commercial_redaction=${input.audience.clientVisibleForPrivateCommercialRedaction}; recipients=${input.audience.recipientCount}; broadcast_risk=${input.audience.broadcastRisk}`,
      MAX_SUMMARY_LINE_CHARS,
    ),
  );
  lines.push(
    truncateLine(
      `Policy: ${input.policy.effectivePlaybookRuleIds.length} effective rule(s)${input.policy.baselineDiffersFromEffective ? "; baseline differed (exceptions/merge)" : ""}${input.policy.appliedAuthorizedExceptionIds.length > 0 ? `; exceptions: ${input.policy.appliedAuthorizedExceptionIds.join(",")}` : ""}`,
      MAX_SUMMARY_LINE_CHARS,
    ),
  );
  if (input.policy.policyEvaluationActionKey) {
    lines.push(
      truncateLine(`Policy evaluation action_key: ${input.policy.policyEvaluationActionKey}`, MAX_SUMMARY_LINE_CHARS),
    );
  }
  lines.push(
    truncateLine(
      `Memory: ${input.memoryRetrieval.selectedMemoryIds.length} id(s) loaded; verify_note_mem=${input.memoryRetrieval.verifyNoteMemoryPresent}; verify_note_injection=${input.memoryRetrieval.verifyNoteInfluencedInjection}; GK=${input.memoryRetrieval.globalKnowledgeFetch} (${input.memoryRetrieval.globalKnowledgeLoadedCount} rows)`,
      MAX_SUMMARY_LINE_CHARS,
    ),
  );
  if (input.riskSignals.authorityPolicy?.reasonCode) {
    lines.push(truncateLine(`AP1 / authority: ${input.riskSignals.authorityPolicy.reasonCode}`, MAX_SUMMARY_LINE_CHARS));
  }
  if (input.riskSignals.bankingCompliance?.reasonCode) {
    lines.push(
      truncateLine(`Banking/compliance: ${input.riskSignals.bankingCompliance.reasonCode}`, MAX_SUMMARY_LINE_CHARS),
    );
  }
  if (input.packageInclusionHints.length > 0) {
    lines.push(
      truncateLine(`Package inclusion hints in injection: ${input.packageInclusionHints.join(", ")}`, MAX_SUMMARY_LINE_CHARS),
    );
  }
  if (input.blockers.draftSkipReason) {
    lines.push(truncateLine(`Draft skipped: ${input.blockers.draftSkipReason}`, MAX_SUMMARY_LINE_CHARS));
  }
  if (input.blockers.escalationSkipReason) {
    lines.push(truncateLine(`Escalation skipped: ${input.blockers.escalationSkipReason}`, MAX_SUMMARY_LINE_CHARS));
  }
  if (input.executionContext.openEscalationCount > 0) {
    lines.push(
      truncateLine(
        `Open escalations on scope: ${input.executionContext.openEscalationCount}`,
        MAX_SUMMARY_LINE_CHARS,
      ),
    );
  }
  if (input.executionContext.pendingDraftApprovalCount > 0) {
    lines.push(
      truncateLine(
        `Pending draft approvals on thread: ${input.executionContext.pendingDraftApprovalCount}`,
        MAX_SUMMARY_LINE_CHARS,
      ),
    );
  }
  if (input.executionContext.workflowNote) {
    lines.push(truncateLine(`Workflow: ${input.executionContext.workflowNote}`, MAX_SUMMARY_LINE_CHARS));
  }
  if (input.persona.pathAttempted) {
    lines.push(
      truncateLine(
        `Persona auditor: ${input.persona.passed === true ? "passed" : input.persona.passed === false ? "failed" : "n/a"}${input.persona.skipOrViolationSummary ? ` — ${input.persona.skipOrViolationSummary}` : ""}`,
        MAX_SUMMARY_LINE_CHARS,
      ),
    );
  }
  return lines.slice(0, MAX_SUMMARY_LINES);
}

export function buildV3ClientOrchestratorDecisionExplanation(params: {
  heavyContextLayers: OrchestratorHeavyContextLayers;
  proposedActions: OrchestratorProposalCandidate[];
  verifierResult: AgentResult<Record<string, unknown>>;
  draftAttempt: OrchestratorDraftAttemptResult;
  escalationAttempt: OrchestratorEscalationArtifactResult;
  orchestratorOutcome: ClientOrchestratorV1Outcome;
  orchestratorContextInjection: OrchestratorContextInjection;
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode;
  personaOutputAuditor?: PersonaOutputAuditorSummaryForExplanation;
}): V3ClientOrchestratorDecisionExplanation {
  const {
    heavyContextLayers,
    proposedActions,
    verifierResult,
    draftAttempt,
    escalationAttempt,
    orchestratorOutcome,
    orchestratorContextInjection,
    requestedExecutionMode,
    personaOutputAuditor,
  } = params;

  const chosenCandidate = resolveChosenCandidate(draftAttempt, escalationAttempt, proposedActions);
  const vf = parseVerifierFacts(verifierResult.facts as Record<string, unknown> | undefined);
  const policyEvalKey = resolveVerifierPolicyEvaluationActionKey(proposedActions);

  const effectivePlaybookRuleIds = heavyContextLayers.playbookRules.map((r) => r.id);
  const rawPlaybookRuleIds = heavyContextLayers.rawPlaybookRules.map((r) => r.id);
  const appliedAuthorizedExceptionIds = [
    ...new Set(
      heavyContextLayers.playbookRules
        .filter(
          (r) =>
            r.effectiveDecisionSource === "authorized_exception" &&
            typeof r.appliedAuthorizedExceptionId === "string" &&
            r.appliedAuthorizedExceptionId.length > 0,
        )
        .map((r) => r.appliedAuthorizedExceptionId!),
    ),
  ];
  const rawSet = new Set(rawPlaybookRuleIds);
  const effSet = new Set(effectivePlaybookRuleIds);
  const idSetsDiffer =
    rawSet.size !== effSet.size || [...rawSet].some((id) => !effSet.has(id));
  const baselineDiffersFromEffective =
    appliedAuthorizedExceptionIds.length > 0 || idSetsDiffer;

  const verifyNoteMemoryPresent = heavyContextLayers.selectedMemories.some(
    (m) => m.type === "v3_verify_case_note",
  );
  const verifyNoteInjectionMarkerPresent = orchestratorContextInjection.action_constraints.some((c) =>
    c.toLowerCase().includes("verify-note"),
  );
  /** Causal: only when verify-note memory was loaded and constraints explicitly mention verify-note (not multi-actor-only). */
  const verifyNoteInfluencedInjection = verifyNoteMemoryPresent && verifyNoteInjectionMarkerPresent;

  const rt = heavyContextLayers.retrievalTrace;
  const persona = (() => {
    const p = personaOutputAuditor;
    if (!p) {
      return { pathAttempted: false, passed: null as boolean | null, skipOrViolationSummary: null as string | null };
    }
    if (p.ran === false) {
      return {
        pathAttempted: false,
        passed: null,
        skipOrViolationSummary: p.reason ?? null,
      };
    }
    if (p.passed === true) {
      return { pathAttempted: true, passed: true, skipOrViolationSummary: null };
    }
    return {
      pathAttempted: true,
      passed: false,
      skipOrViolationSummary: (p.violations ?? []).slice(0, 5).join("; ") || "failed",
    };
  })();

  const base: Omit<V3ClientOrchestratorDecisionExplanation, "summaryLines" | "schemaVersion"> = {
    outcome: orchestratorOutcome,
    requestedExecutionMode,
    verifier: {
      success: verifierResult.success === true,
      verifierStage: vf.verifierStage,
      policyVerdict: vf.policyVerdict,
      reasonCodes: vf.reasonCodes,
      pipelineHaltsBeforeExternalSend: vf.pipelineHaltsBeforeExternalSend,
      policyGateApplied: vf.policyGateApplied,
      ruleId: vf.ruleId,
      policyEvaluationActionKey: policyEvalKey ?? vf.policyEvaluationActionKey,
      mergedPlaybookDecisionModeFromRelevantRules: vf.mergedPlaybookDecisionModeFromRelevantRules,
    },
    chosenPath: {
      selectionSource: selectionSource(draftAttempt, escalationAttempt, chosenCandidate),
      chosenCandidateId: chosenCandidate?.id ?? null,
      actionFamily: chosenCandidate?.action_family ?? null,
      actionKey: chosenCandidate?.action_key ?? null,
      likelyOutcome: chosenCandidate?.likely_outcome ?? null,
      routineBaselineSendMessageCandidate: routineBaselineSendMessageCandidate(proposedActions),
    },
    authority: {
      bucket: heavyContextLayers.inboundSenderAuthority.bucket,
      isApprovalContact: heavyContextLayers.inboundSenderAuthority.isApprovalContact,
      source: heavyContextLayers.inboundSenderAuthority.source,
      personId: heavyContextLayers.inboundSenderAuthority.personId,
    },
    audience: {
      visibilityClass: heavyContextLayers.audience.visibilityClass,
      clientVisibleForPrivateCommercialRedaction:
        heavyContextLayers.audience.clientVisibleForPrivateCommercialRedaction,
      recipientCount: heavyContextLayers.audience.recipientCount,
      broadcastRisk: heavyContextLayers.audience.broadcastRisk,
    },
    policy: {
      effectivePlaybookRuleIds,
      rawPlaybookRuleIds,
      baselineDiffersFromEffective,
      appliedAuthorizedExceptionIds,
      policyEvaluationActionKey: policyEvalKey ?? vf.policyEvaluationActionKey,
    },
    memoryRetrieval: {
      selectedMemoryIds: rt.selectedMemoryIdsResolved,
      selectedMemoryTypes: heavyContextLayers.selectedMemories.map((m) => ({ id: m.id, type: m.type })),
      verifyNoteMemoryPresent,
      verifyNoteInfluencedInjection,
      globalKnowledgeFetch: rt.globalKnowledgeFetch,
      globalKnowledgeLoadedCount: rt.globalKnowledgeLoadedCount,
      retrievalGateDetailShort:
        typeof rt.globalKnowledgeGateDetail === "string" && rt.globalKnowledgeGateDetail.length > 0
          ? rt.globalKnowledgeGateDetail.slice(0, 120)
          : null,
    },
    riskSignals: extractRiskSignals(chosenCandidate),
    blockers: {
      draftSkipReason: draftAttempt.skipReason,
      escalationSkipReason: escalationAttempt.skipReason,
      chosenCandidateBlockers: chosenCandidate?.blockers_or_missing_facts ?? [],
    },
    executionContext: {
      openEscalationCount: heavyContextLayers.escalationState.openCount,
      pendingDraftApprovalCount: heavyContextLayers.threadDraftsSummary?.pendingApprovalCount ?? 0,
      workflowNote: buildWorkflowNote(heavyContextLayers),
    },
    packageInclusionHints: packageInclusionHintsFromInjection(orchestratorContextInjection.action_constraints),
    persona,
  };

  return {
    schemaVersion: V3_CLIENT_ORCHESTRATOR_DECISION_EXPLANATION_SCHEMA_VERSION,
    ...base,
    summaryLines: buildSummaryLines(base),
  };
}
