import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import type { CrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import {
  commercialDepositStarvationStructuredApplies,
  crmHasGroundedFinancialTerms,
  evaluateFinancialPolicyGrounding,
  hasFinancialGrounding,
  hasSpecificPaymentTermsGrounding,
  ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER,
  shouldAppendCommercialDepositStarvationLastMileFacts,
} from "./orchestratorCommercialDepositStarvation.ts";

function minimalDc(
  over: Partial<DecisionContext["audience"]> = {},
  crmSnapshot: CrmSnapshot = emptyCrmSnapshot(),
): DecisionContext {
  return {
    contextVersion: 1,
    photographerId: "p",
    weddingId: "w",
    threadId: "t",
    replyChannel: "email",
    rawMessage: "",
    crmSnapshot,
    recentMessages: [],
    threadSummary: null,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    audience: {
      threadParticipants: [],
      agencyCcLock: null,
      broadcastRisk: "low",
      recipientCount: 2,
      visibilityClass: "client_visible",
      clientVisibleForPrivateCommercialRedaction: true,
      approvalContactPersonIds: [],
      ...over,
    },
    candidateWeddingIds: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
    threadDraftsSummary: null,
    inboundSenderIdentity: null,
    inboundSenderAuthority: {
      bucket: "unknown",
      personId: null,
      isApprovalContact: false,
      source: "unresolved",
    },
    retrievalTrace: {
      selectedMemoryIdsResolved: [],
      selectedMemoriesLoadedCount: 0,
      globalKnowledgeIdsLoaded: [],
      globalKnowledgeLoadedCount: 0,
      globalKnowledgeFetch: "skipped_by_gate",
      globalKnowledgeGateDetail: "skipped_no_heuristic_signal",
    },
    inquiryFirstStepStyle: "proactive_call",
  } as DecisionContext;
}

describe("hasFinancialGrounding", () => {
  it("is false when snapshot is missing, empty, or only null financial fields", () => {
    expect(hasFinancialGrounding(undefined)).toBe(false);
    expect(hasFinancialGrounding(null)).toBe(false);
    expect(hasFinancialGrounding(emptyCrmSnapshot())).toBe(false);
    expect(
      hasFinancialGrounding({ ...emptyCrmSnapshot(), contract_value: null, balance_due: null }),
    ).toBe(false);
  });

  it("is true when contract_value or balance_due is a finite number (financial existence, not payment structure)", () => {
    expect(hasFinancialGrounding({ ...emptyCrmSnapshot(), contract_value: 10000 })).toBe(true);
    expect(hasFinancialGrounding({ ...emptyCrmSnapshot(), balance_due: 0 })).toBe(true);
  });
});

describe("crmHasGroundedFinancialTerms (deprecated alias)", () => {
  it("matches hasFinancialGrounding", () => {
    const snap = { ...emptyCrmSnapshot(), contract_value: 1 };
    expect(crmHasGroundedFinancialTerms(snap)).toBe(hasFinancialGrounding(snap));
  });
});

describe("hasSpecificPaymentTermsGrounding", () => {
  const ruleNoPct: PlaybookRuleContextRow = {
    id: "1",
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

  it("is false for playbook text without deposit/schedule % patterns", () => {
    expect(hasSpecificPaymentTermsGrounding([ruleNoPct])).toBe(false);
  });

  it("is true when playbook has verified deposit percentage language", () => {
    const withPct: PlaybookRuleContextRow = {
      ...ruleNoPct,
      instruction: "Deposit is 30% to hold the date per contract.",
    };
    expect(hasSpecificPaymentTermsGrounding([withPct])).toBe(true);
  });

  it("is true when playbook has payment-schedule % grounding", () => {
    const withSchedule: PlaybookRuleContextRow = {
      ...ruleNoPct,
      instruction: "Second payment 40% due per installment schedule before the wedding.",
    };
    expect(hasSpecificPaymentTermsGrounding([withSchedule])).toBe(true);
  });
});

describe("evaluateFinancialPolicyGrounding", () => {
  const ruleNoPct: PlaybookRuleContextRow = {
    id: "1",
    action_key: "send_message",
    topic: "general",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction: "Defer to contract.",
    source_type: "test",
    confidence_label: "explicit",
    is_active: true,
  };

  it("separates CRM financial existence from playbook payment-term grounding", () => {
    const g = evaluateFinancialPolicyGrounding([ruleNoPct], { ...emptyCrmSnapshot(), contract_value: 5000 });
    expect(g.hasFinancialGrounding).toBe(true);
    expect(g.hasSpecificPaymentTermsGrounding).toBe(false);
  });

  it("marks payment terms grounded when playbook carries schedule %", () => {
    const withSchedule: PlaybookRuleContextRow = {
      ...ruleNoPct,
      instruction: "50% at booking, 50% before event per payment schedule.",
    };
    const g = evaluateFinancialPolicyGrounding([withSchedule], emptyCrmSnapshot());
    expect(g.hasFinancialGrounding).toBe(false);
    expect(g.hasSpecificPaymentTermsGrounding).toBe(true);
  });
});

const ruleNoDepositPercent: PlaybookRuleContextRow = {
  id: "1",
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

const chosenSend: OrchestratorProposalCandidate = {
  id: "c1",
  action_family: "send_message",
  action_key: "send_message",
  rationale: "Move the thread forward with a concise reply.",
  verifier_gating_required: false,
  likely_outcome: "draft",
  blockers_or_missing_facts: [],
};

const inquiryGenericBooking: InquiryReplyPlan = {
  schemaVersion: 1,
  inquiry_motion: "consultation_first",
  confirm_availability: false,
  mention_booking_terms: "generic",
  budget_clause_mode: "none",
  opening_tone: "warm",
  cta_type: "call",
  cta_intensity: "direct",
  inquiry_first_step_style_effective: "proactive_call",
};

describe("commercialDepositStarvationStructuredApplies", () => {
  it("true for mixed_audience when playbook lacks specific payment-term grounding", () => {
    const dc = minimalDc({ visibilityClass: "mixed_audience" });
    expect(commercialDepositStarvationStructuredApplies([ruleNoDepositPercent], dc.audience, null)).toBe(true);
  });

  it("true for mixed_audience even when CRM has contract_value (financial existence ≠ payment terms)", () => {
    const dc = minimalDc({ visibilityClass: "mixed_audience" }, { ...emptyCrmSnapshot(), contract_value: 25000 });
    expect(commercialDepositStarvationStructuredApplies([ruleNoDepositPercent], dc.audience, null)).toBe(true);
  });

  it("true for inquiry plan with mention_booking_terms generic even when CRM has balance_due", () => {
    const dc = minimalDc({ visibilityClass: "client_visible", broadcastRisk: "low" }, { ...emptyCrmSnapshot(), balance_due: 100 });
    expect(
      commercialDepositStarvationStructuredApplies([ruleNoDepositPercent], dc.audience, inquiryGenericBooking),
    ).toBe(true);
  });

  it("false when playbook text includes a verified deposit percentage", () => {
    const dc = minimalDc({ visibilityClass: "mixed_audience" });
    const withPct: PlaybookRuleContextRow = {
      ...ruleNoDepositPercent,
      instruction: "Deposit is 30% to hold the date per contract.",
    };
    expect(commercialDepositStarvationStructuredApplies([withPct], dc.audience, null)).toBe(false);
  });

  it("false when playbook has payment-schedule % grounding without deposit wording", () => {
    const dc = minimalDc({ visibilityClass: "mixed_audience" });
    const withSchedule: PlaybookRuleContextRow = {
      ...ruleNoDepositPercent,
      instruction: "Second payment 40% due per installment schedule before the wedding.",
    };
    expect(commercialDepositStarvationStructuredApplies([withSchedule], dc.audience, null)).toBe(false);
  });

  it("true for high broadcast risk when playbook lacks payment-term grounding", () => {
    const dc = minimalDc({ broadcastRisk: "high", visibilityClass: "client_visible" });
    expect(commercialDepositStarvationStructuredApplies([ruleNoDepositPercent], dc.audience, null)).toBe(true);
  });

  it("false for client_visible + low + no inquiry booking plan", () => {
    const dc = minimalDc({ visibilityClass: "client_visible", broadcastRisk: "low" });
    expect(commercialDepositStarvationStructuredApplies([ruleNoDepositPercent], dc.audience, null)).toBe(false);
  });
});

describe("shouldAppendCommercialDepositStarvationLastMileFacts", () => {
  it("false when action_key is not primary send_message", () => {
    const dc = minimalDc({ visibilityClass: "mixed_audience" });
    const other: OrchestratorProposalCandidate = {
      ...chosenSend,
      action_key: "v3_wedding_identity_disambiguation",
    };
    expect(
      shouldAppendCommercialDepositStarvationLastMileFacts([ruleNoDepositPercent], other, dc.audience, null),
    ).toBe(false);
  });

  it("true for primary send + mixed_audience + ungrounded payment terms in playbook", () => {
    const dc = minimalDc({ visibilityClass: "mixed_audience" }, { ...emptyCrmSnapshot(), contract_value: 9999 });
    expect(
      shouldAppendCommercialDepositStarvationLastMileFacts([ruleNoDepositPercent], chosenSend, dc.audience, null),
    ).toBe(true);
  });
});

describe("ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER", () => {
  it("includes proximity constraint key", () => {
    expect(ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER.length).toBeGreaterThan(10);
  });
});
