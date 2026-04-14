import { describe, expect, it } from "vitest";
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import type {
  EffectivePlaybookRule,
  OrchestratorContextInjection,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import { PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM } from "./buildOrchestratorSupportingContextInjection.ts";
import { buildV3ClientOrchestratorDecisionExplanation } from "./buildV3ClientOrchestratorDecisionExplanation.ts";
import type { OrchestratorHeavyContextLayers } from "./clientOrchestratorV1Core.ts";

function basePlaybookRow(id: string, actionKey: string): PlaybookRuleContextRow {
  return {
    id,
    action_key: actionKey,
    instruction: "instr",
    decision_mode: "auto",
    scope: "global",
    topic: "t",
    photographer_id: "p1",
    channel: null,
    confidence_label: "explicit",
    source_type: "seed",
    is_active: true,
    created_at: "",
    updated_at: "",
  } as PlaybookRuleContextRow;
}

function makeHeavy(overrides: Partial<OrchestratorHeavyContextLayers>): OrchestratorHeavyContextLayers {
  const base: OrchestratorHeavyContextLayers = {
    selectedMemories: [],
    globalKnowledge: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
    audience: {
      threadParticipants: [],
      agencyCcLock: null,
      broadcastRisk: "low",
      recipientCount: 1,
      visibilityClass: "client_visible",
      clientVisibleForPrivateCommercialRedaction: true,
      approvalContactPersonIds: [],
    },
    weddingId: null,
    crmSnapshot: null,
    threadDraftsSummary: null,
    threadContextSnippet: "",
    v3ThreadWorkflow: null,
    escalationState: { openEscalationIds: [], openCount: 0 },
    candidateWeddingIds: [],
    inboundSenderIdentity: null,
    inboundSenderAuthority: {
      bucket: "planner",
      personId: "person-1",
      isApprovalContact: true,
      source: "thread_sender",
    },
    retrievalTrace: {
      selectedMemoryIdsResolved: [],
      selectedMemoriesLoadedCount: 0,
      globalKnowledgeIdsLoaded: [],
      globalKnowledgeLoadedCount: 0,
      globalKnowledgeFetch: "queried",
      globalKnowledgeGateDetail: "ok",
    },
  };
  return { ...base, ...overrides };
}

const emptyDraftAttempt = {
  draftCreated: false,
  draftId: null,
  chosenCandidate: null,
  skipReason: null,
} as const;

const emptyEscalationAttempt = {
  escalationArtifactCreated: false,
  toolEscalateSuccess: false,
  escalationFacts: null,
  toolEscalateError: null,
  skipReason: null,
  chosenCandidateForEscalation: null,
} as const;

const baseInjection = (action_constraints: string[]): OrchestratorContextInjection => ({
  approved_supporting_facts: [],
  action_constraints,
  retrieval_observation: {
    selected_memory_ids: [],
    global_knowledge_ids_loaded: [],
    global_knowledge_fetch: "queried",
    global_knowledge_gate_detail: "ok",
    trace_line: "t",
  },
  memory_digest_lines: [],
  global_knowledge_digest_lines: [],
});

describe("buildV3ClientOrchestratorDecisionExplanation", () => {
  it("surfaces AP1 / authority policy codes from the chosen candidate", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "c-ap1",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "r",
        verifier_gating_required: false,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
        authority_policy_class: "commercial_terms_authority_insufficient",
        authority_policy_reason_code: "AP1_COMMERCIAL_TERMS_AUTHORITY_V1",
      },
    ];
    const verifierResult: AgentResult<Record<string, unknown>> = {
      success: true,
      facts: {
        verifierStage: "draft_only",
        reasonCodes: ["X"],
        policyVerdict: "require_draft_only",
      },
      confidence: 1,
      error: null,
    };
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({}),
      proposedActions: proposals,
      verifierResult,
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: baseInjection([]),
      requestedExecutionMode: "auto",
    });
    expect(exp.riskSignals.authorityPolicy?.class).toBe("commercial_terms_authority_insufficient");
    expect(exp.riskSignals.authorityPolicy?.reasonCode).toBe("AP1_COMMERCIAL_TERMS_AUTHORITY_V1");
    expect(exp.summaryLines.some((l) => l.includes("AP1") || l.includes("authority"))).toBe(true);
    expect(exp.audience.visibilityClass).toBe("client_visible");
    expect(exp.audience.clientVisibleForPrivateCommercialRedaction).toBe(true);
    expect(exp.audience.recipientCount).toBe(1);
    expect(exp.summaryLines.some((l) => l.startsWith("Audience:"))).toBe(true);
  });

  it("surfaces Phase 1 audience classification in explanation (planner_only — no private-commercial redaction flag)", () => {
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({
        audience: {
          threadParticipants: [],
          agencyCcLock: null,
          broadcastRisk: "unknown",
          recipientCount: 2,
          visibilityClass: "planner_only",
          clientVisibleForPrivateCommercialRedaction: false,
          approvalContactPersonIds: [],
        },
      }),
      proposedActions: [],
      verifierResult: { success: true, facts: {}, confidence: 1, error: null },
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: baseInjection([]),
      requestedExecutionMode: "auto",
    });
    expect(exp.audience.visibilityClass).toBe("planner_only");
    expect(exp.audience.clientVisibleForPrivateCommercialRedaction).toBe(false);
    expect(exp.audience.recipientCount).toBe(2);
    expect(exp.summaryLines.some((l) => l.includes("planner_only") && l.includes("private_commercial_redaction=false"))).toBe(true);
  });

  it("records package inclusion hints when injection constraints carry package-inclusion markers", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "c1",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "r",
        verifier_gating_required: false,
        likely_outcome: "auto",
        blockers_or_missing_facts: [],
      },
    ];
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({}),
      proposedActions: proposals,
      verifierResult: { success: true, facts: {}, confidence: 1, error: null },
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "auto",
      orchestratorContextInjection: baseInjection([
        `${PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM} — test`,
      ]),
      requestedExecutionMode: "auto",
    });
    expect(exp.packageInclusionHints).toContain("travel");
    expect(exp.summaryLines.some((l) => l.includes("Package inclusion"))).toBe(true);
  });

  it("lists applied authorized exception ids and baseline/effective diff", () => {
    const raw = [basePlaybookRow("r-base", "send_message")];
    const effective: EffectivePlaybookRule[] = [
      {
        ...raw[0],
        decision_mode: "draft_only",
        effectiveDecisionSource: "authorized_exception",
        appliedAuthorizedExceptionId: "ex-auth-99",
      },
    ];
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({
        rawPlaybookRules: raw,
        playbookRules: effective,
        authorizedCaseExceptions: [{ id: "ex-auth-99" } as never],
      }),
      proposedActions: [],
      verifierResult: { success: true, facts: {}, confidence: 1, error: null },
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: baseInjection([]),
      requestedExecutionMode: "auto",
    });
    expect(exp.policy.appliedAuthorizedExceptionIds).toContain("ex-auth-99");
    expect(exp.policy.baselineDiffersFromEffective).toBe(true);
    expect(exp.summaryLines.some((l) => l.includes("ex-auth-99"))).toBe(true);
  });

  it("flags verify-note memory and injection influence from structured facts", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "c1",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "r",
        verifier_gating_required: false,
        likely_outcome: "auto",
        blockers_or_missing_facts: [],
      },
    ];
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({
        selectedMemories: [
          {
            id: "mem-vn",
            type: "v3_verify_case_note",
            title: "vn",
            summary: "s",
            full_content: "c",
          },
        ],
        retrievalTrace: {
          selectedMemoryIdsResolved: ["mem-vn"],
          selectedMemoriesLoadedCount: 1,
          globalKnowledgeIdsLoaded: [],
          globalKnowledgeLoadedCount: 0,
          globalKnowledgeFetch: "skipped_by_gate",
          globalKnowledgeGateDetail: "blocked_by_retrieval_gate_detail",
        },
      }),
      proposedActions: proposals,
      verifierResult: { success: true, facts: {}, confidence: 1, error: null },
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: baseInjection(["verify-note constraint: signer must confirm"]),
      requestedExecutionMode: "auto",
    });
    expect(exp.memoryRetrieval.verifyNoteMemoryPresent).toBe(true);
    expect(exp.memoryRetrieval.verifyNoteInfluencedInjection).toBe(true);
    expect(exp.memoryRetrieval.globalKnowledgeFetch).toBe("skipped_by_gate");
    expect(exp.memoryRetrieval.retrievalGateDetailShort).toContain("blocked_by_retrieval");
    expect(exp.summaryLines.some((l) => l.includes("verify_note_mem=true"))).toBe(true);
    expect(exp.summaryLines.some((l) => l.includes("verify_note_injection=true"))).toBe(true);
    expect(exp.summaryLines.some((l) => l.includes("skipped_by_gate"))).toBe(true);
  });

  it("does not set verifyNoteInfluencedInjection for multi-actor-only constraints (even with verify-note memory)", () => {
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({
        selectedMemories: [
          {
            id: "mem-vn",
            type: "v3_verify_case_note",
            title: "vn",
            summary: "s",
            full_content: "c",
          },
        ],
      }),
      proposedActions: [],
      verifierResult: { success: true, facts: {}, confidence: 1, error: null },
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: baseInjection([
        "Multi-actor authority (planner schedule change): signer must confirm timeline",
      ]),
      requestedExecutionMode: "auto",
    });
    expect(exp.memoryRetrieval.verifyNoteMemoryPresent).toBe(true);
    expect(exp.memoryRetrieval.verifyNoteInfluencedInjection).toBe(false);
  });

  it("does not set verifyNoteInfluencedInjection when constraints mention verify-note but no verify-note memory was loaded", () => {
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({ selectedMemories: [] }),
      proposedActions: [],
      verifierResult: { success: true, facts: {}, confidence: 1, error: null },
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: baseInjection(["verify-note constraint: signer must confirm"]),
      requestedExecutionMode: "auto",
    });
    expect(exp.memoryRetrieval.verifyNoteMemoryPresent).toBe(false);
    expect(exp.memoryRetrieval.verifyNoteInfluencedInjection).toBe(false);
  });

  it("uses baseline send_message for comparison, not v3_authority_policy_clarification", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "clar",
        action_family: "send_message",
        action_key: "v3_authority_policy_clarification",
        rationale: "clarify",
        verifier_gating_required: false,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
        authority_policy_class: "commercial_terms_authority_insufficient",
        authority_policy_reason_code: "AP1_COMMERCIAL_TERMS_AUTHORITY_V1",
      },
      {
        id: "base",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "routine",
        verifier_gating_required: false,
        likely_outcome: "auto",
        blockers_or_missing_facts: [],
      },
    ];
    const exp = buildV3ClientOrchestratorDecisionExplanation({
      heavyContextLayers: makeHeavy({}),
      proposedActions: proposals,
      verifierResult: { success: true, facts: {}, confidence: 1, error: null },
      draftAttempt: emptyDraftAttempt,
      escalationAttempt: emptyEscalationAttempt,
      orchestratorOutcome: "draft",
      orchestratorContextInjection: baseInjection([]),
      requestedExecutionMode: "auto",
    });
    expect(exp.chosenPath.routineBaselineSendMessageCandidate?.actionKey).toBe("send_message");
    expect(exp.chosenPath.routineBaselineSendMessageCandidate?.likelyOutcome).toBe("auto");
    const baselineLine = exp.summaryLines.find((l) => l.includes("Baseline send_message candidate:"));
    expect(baselineLine).toBeDefined();
    expect(baselineLine).toContain("send_message");
    expect(baselineLine).not.toContain("v3_authority_policy_clarification");
    expect(exp.summaryLines.some((l) => l.includes("Chosen:") && l.includes("v3_authority_policy_clarification"))).toBe(true);
  });
});
