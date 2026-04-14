import { describe, expect, it } from "vitest";
import {
  buildOrchestratorSupportingContextInjection,
  formatOrchestratorContextInjectionRationaleSuffix,
  MAX_ORCHESTRATOR_CONTEXT_RATIONALE_SUFFIX_CHARS,
  PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_CONFIRM,
  PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_NOT_LISTED,
  PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM,
  PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_NOT_LISTED,
} from "./buildOrchestratorSupportingContextInjection.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import { proposeClientOrchestratorCandidateActions } from "./proposeClientOrchestratorCandidateActions.ts";
import type {
  DecisionAudienceSnapshot,
  DecisionContextRetrievalTrace,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import { COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER } from "./orchestratorCommercialDepositStarvation.ts";

function traceBase(over: Partial<DecisionContextRetrievalTrace> = {}): DecisionContextRetrievalTrace {
  return {
    selectedMemoryIdsResolved: ["m1"],
    selectedMemoriesLoadedCount: 1,
    globalKnowledgeIdsLoaded: ["k1"],
    globalKnowledgeLoadedCount: 1,
    globalKnowledgeFetch: "queried",
    globalKnowledgeGateDetail: "gate_ok",
    ...over,
  };
}

function baseAudience(over: Partial<DecisionAudienceSnapshot> = {}): DecisionAudienceSnapshot {
  return {
    threadParticipants: [],
    agencyCcLock: false,
    broadcastRisk: "low",
    recipientCount: 1,
    visibilityClass: "client_visible",
    clientVisibleForPrivateCommercialRedaction: false,
    approvalContactPersonIds: [],
    ...over,
  };
}

const ruleNoFinancialGrounding: PlaybookRuleContextRow = {
  id: "r0",
  action_key: "send_message",
  topic: "general",
  decision_mode: "draft_only",
  scope: "global",
  channel: null,
  instruction: "Be helpful; align with contract.",
  source_type: "test",
  confidence_label: "explicit",
  is_active: true,
};

describe("buildOrchestratorSupportingContextInjection", () => {
  it("synthesizes facts, constraints, and bounded digests; playbook is primary in copy", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [
        {
          id: "m1",
          type: "v3_verify_case_note",
          title: "Pricing note",
          summary: "Confirm retainer with playbook before quoting.",
        },
      ],
      globalKnowledge: [
        {
          id: "kb-1",
          document_type: "past_email",
          content: "We typically respond within 24 hours on weekdays.",
        },
      ],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding, ruleNoFinancialGrounding, ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
    });

    expect(inj.approved_supporting_facts.some((s) => s.includes("Playbook rules"))).toBe(true);
    expect(inj.action_constraints.some((c) => c.includes("Verify-note"))).toBe(true);
    expect(inj.memory_digest_lines.length).toBe(1);
    expect(inj.global_knowledge_digest_lines.length).toBe(1);
    expect(inj.retrieval_observation.trace_line).toContain("gk_fetch=queried");
  });

  it("redacts planner-private phrasing in injection digests when clientVisibleForPrivateCommercialRedaction is true", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [
        {
          id: "m1",
          type: "case",
          title: "Venue planner commission",
          summary: "Discuss agency fee with studio only",
        },
      ],
      globalKnowledge: [],
      retrievalTrace: traceBase({ globalKnowledgeGateDetail: "internal negotiation gate detail" }),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience({ clientVisibleForPrivateCommercialRedaction: true }),
      inquiryReplyPlan: null,
    });
    expect(inj.memory_digest_lines[0]).toContain("Redacted");
    expect(inj.retrieval_observation.global_knowledge_gate_detail).toContain("Redacted");
  });

  it("does not redact injection digests when planner-only audience (redaction flag false)", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [
        {
          id: "m1",
          type: "case",
          title: "planner commission discussion",
          summary: "internal only",
        },
      ],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience({
        visibilityClass: "planner_only",
        clientVisibleForPrivateCommercialRedaction: false,
      }),
      inquiryReplyPlan: null,
    });
    expect(inj.memory_digest_lines[0]).toContain("planner commission");
  });

  it("adds commercial financial starvation constraint when mixed_audience and playbook lacks grounded %", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience({ visibilityClass: "mixed_audience" }),
      inquiryReplyPlan: null,
    });
    expect(inj.action_constraints.some((c) => c.includes(COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER))).toBe(
      true,
    );
  });

  it("still adds starvation when CRM would have financial existence but playbook lacks payment-term grounding", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience({ visibilityClass: "mixed_audience" }),
      inquiryReplyPlan: null,
    });
    expect(inj.action_constraints.some((c) => c.includes(COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER))).toBe(
      true,
    );
  });

  it("does not add starvation constraint when playbook has payment-schedule % grounding", () => {
    const withSchedule: PlaybookRuleContextRow = {
      ...ruleNoFinancialGrounding,
      id: "r-sched",
      instruction: "Second installment: 50% due 30 days before the wedding per payment schedule.",
    };
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [withSchedule],
      audience: baseAudience({ visibilityClass: "mixed_audience" }),
      inquiryReplyPlan: null,
    });
    expect(inj.action_constraints.some((c) => c.includes(COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER))).toBe(
      false,
    );
  });

  it("records skipped global KB when gate did not query", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase({
        globalKnowledgeFetch: "skipped_by_gate",
        globalKnowledgeLoadedCount: 0,
        globalKnowledgeIdsLoaded: [],
        globalKnowledgeGateDetail: "low_signal_turn",
      }),
      playbookRules: [],
      audience: baseAudience(),
      inquiryReplyPlan: null,
    });

    expect(inj.approved_supporting_facts.some((s) => s.includes("skipped"))).toBe(true);
    expect(inj.retrieval_observation.global_knowledge_fetch).toBe("skipped_by_gate");
  });

  it("adds travel inclusion confirm fact when CRM lists travel_fee_included and client asks", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
      crmSnapshot: { ...emptyCrmSnapshot(), package_inclusions: ["travel_fee_included"] },
      rawMessageForPackageInclusion: "Are flights included?",
    });
    expect(inj.approved_supporting_facts[0]).toContain(PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM);
    expect(inj.action_constraints.some((c) => c.includes(PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_NOT_LISTED))).toBe(
      false,
    );
  });

  it("adds travel not-listed constraint when CRM omits travel_fee_included", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
      crmSnapshot: emptyCrmSnapshot(),
      rawMessageForPackageInclusion: "Is travel included in the package?",
    });
    expect(inj.action_constraints.some((c) => c.includes(PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_NOT_LISTED))).toBe(
      true,
    );
  });

  it("adds second-shooter confirm fact when CRM lists second_shooter", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
      crmSnapshot: { ...emptyCrmSnapshot(), package_inclusions: ["second_shooter"] },
      rawMessageForPackageInclusion: "Do we have a second shooter?",
    });
    expect(inj.approved_supporting_facts[0]).toContain(PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_CONFIRM);
  });

  it("adds second-shooter not-listed constraint when CRM omits second_shooter", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
      crmSnapshot: emptyCrmSnapshot(),
      rawMessageForPackageInclusion: "Is a second shooter included?",
    });
    expect(inj.action_constraints.some((c) => c.includes(PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_NOT_LISTED))).toBe(
      true,
    );
  });

  it("does not add package slice when message has no inclusion intent", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
      crmSnapshot: { ...emptyCrmSnapshot(), package_inclusions: ["travel_fee_included", "second_shooter"] },
      rawMessageForPackageInclusion: "Thanks for the timeline!",
    });
    expect(inj.approved_supporting_facts.some((f) => f.includes("package_inclusions"))).toBe(false);
    expect(inj.action_constraints.some((c) => c.includes("package_inclusions"))).toBe(false);
  });

  it("caps rationale suffix length", () => {
    const manyMem = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      type: "note",
      title: "x".repeat(80),
      summary: "y".repeat(200),
    }));
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: manyMem,
      globalKnowledge: [],
      retrievalTrace: traceBase({
        selectedMemoryIdsResolved: manyMem.map((m) => m.id),
        selectedMemoriesLoadedCount: manyMem.length,
      }),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
    });
    const suffix = formatOrchestratorContextInjectionRationaleSuffix(inj);
    expect(suffix.length).toBeLessThanOrEqual(MAX_ORCHESTRATOR_CONTEXT_RATIONALE_SUFFIX_CHARS);
  });
});

describe("proposeClientOrchestratorCandidateActions — context injection", () => {
  it("appends suffix to primary send_message when contextInjection provided", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [{ id: "a", type: "note", title: "T", summary: "S" }],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding, ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: {
        threadParticipants: [],
        agencyCcLock: false,
        broadcastRisk: "low",
        recipientCount: 1,
        visibilityClass: "client_visible",
        clientVisibleForPrivateCommercialRedaction: false,
        approvalContactPersonIds: [],
      },
      playbookRules: [],
      selectedMemoriesCount: 1,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Hello thanks",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      contextInjection: inj,
    });
    const sm = proposals.find((p) => p.action_family === "send_message" && p.action_key === "send_message");
    expect(sm?.rationale).toContain("Retrieval:");
    expect(sm?.rationale).toContain("Playbook rules");
    expect(sm?.rationale.includes("Memory digest:")).toBe(false);
  });

  it("includes starvation marker in primary send rationale when injection carries it (mixed_audience)", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience({ visibilityClass: "mixed_audience" }),
      inquiryReplyPlan: null,
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: {
        threadParticipants: [],
        agencyCcLock: false,
        broadcastRisk: "low",
        recipientCount: 2,
        visibilityClass: "mixed_audience",
        clientVisibleForPrivateCommercialRedaction: true,
        approvalContactPersonIds: [],
      },
      playbookRules: [ruleNoFinancialGrounding],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Hello",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      contextInjection: inj,
    });
    const sm = proposals.find((p) => p.action_family === "send_message" && p.action_key === "send_message");
    expect(sm?.rationale).toContain(COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER);
  });

  it("does not add suffix when contextInjection omitted", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: {
        threadParticipants: [],
        agencyCcLock: false,
        broadcastRisk: "low",
        recipientCount: 1,
        visibilityClass: "client_visible",
        clientVisibleForPrivateCommercialRedaction: false,
        approvalContactPersonIds: [],
      },
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Hello thanks",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
    });
    const sm = proposals.find((p) => p.action_family === "send_message" && p.action_key === "send_message");
    expect(sm?.rationale.includes("Retrieval:")).toBe(false);
  });

  it("primary send_message rationale carries package-inclusion grounded suffix from real injection build", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
      crmSnapshot: { ...emptyCrmSnapshot(), package_inclusions: ["travel_fee_included"] },
      rawMessageForPackageInclusion: "Are flights included?",
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: {
        threadParticipants: [],
        agencyCcLock: false,
        broadcastRisk: "low",
        recipientCount: 1,
        visibilityClass: "client_visible",
        clientVisibleForPrivateCommercialRedaction: false,
        approvalContactPersonIds: [],
      },
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Are flights included?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      contextInjection: inj,
    });
    const sm = proposals.find((p) => p.action_family === "send_message" && p.action_key === "send_message");
    expect(sm?.rationale).toContain(PACKAGE_INCLUSION_CONTEXT_TRAVEL_FEE_INCLUDED_CONFIRM);
  });

  it("primary send_message rationale carries second-shooter constraint when not in CRM", () => {
    const inj = buildOrchestratorSupportingContextInjection({
      selectedMemories: [],
      globalKnowledge: [],
      retrievalTrace: traceBase(),
      playbookRules: [ruleNoFinancialGrounding],
      audience: baseAudience(),
      inquiryReplyPlan: null,
      crmSnapshot: emptyCrmSnapshot(),
      rawMessageForPackageInclusion: "Do we have a second shooter?",
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: {
        threadParticipants: [],
        agencyCcLock: false,
        broadcastRisk: "low",
        recipientCount: 1,
        visibilityClass: "client_visible",
        clientVisibleForPrivateCommercialRedaction: false,
        approvalContactPersonIds: [],
      },
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Do we have a second shooter?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      contextInjection: inj,
    });
    const sm = proposals.find((p) => p.action_family === "send_message" && p.action_key === "send_message");
    expect(sm?.rationale).toContain(PACKAGE_INCLUSION_CONTEXT_SECOND_SHOOTER_NOT_LISTED);
  });

  it("does not block playbook candidates when memory and KB counts are zero", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: {
        threadParticipants: [],
        agencyCcLock: false,
        broadcastRisk: "low",
        recipientCount: 1,
        visibilityClass: "client_visible",
        clientVisibleForPrivateCommercialRedaction: false,
        approvalContactPersonIds: [],
      },
      playbookRules: [
        {
          id: "r1",
          topic: "tone",
          channel: "email",
          instruction: "Be warm",
          action_key: "send_message",
          decision_mode: "draft_only",
          is_active: true,
        },
      ],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Hello",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
    });
    const pb = proposals.find((p) => p.playbook_rule_ids?.includes("r1"));
    expect(pb?.blockers_or_missing_facts).not.toContain("no_hydrated_memories_or_global_knowledge_rows_in_context");
  });
});
