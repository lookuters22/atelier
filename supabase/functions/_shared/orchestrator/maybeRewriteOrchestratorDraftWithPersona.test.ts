/**
 * Persona writer boundary — numeric commercial policy guardrails (no-playbook / ungrounded %).
 */
import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { redactPersonaWriterFactsBlockForAudience } from "../context/applyAudiencePrivateCommercialRedaction.ts";
import { buildUnknownPolicySignals } from "./commercialPolicySignals.ts";
import { buildOrchestratorFactsForPersonaWriter } from "./maybeRewriteOrchestratorDraftWithPersona.ts";
import {
  COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER,
  ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER,
} from "./orchestratorCommercialDepositStarvation.ts";

const commercialHarnessInbound =
  "Thanks, this helps. We're leaning toward the Elite collection — can you confirm the deposit is 30% to hold the date, " +
  "and that travel for the engagement session within 50 miles of Florence is included? We can pay the deposit this week.";

function rule(partial: Partial<PlaybookRuleContextRow> & Pick<PlaybookRuleContextRow, "instruction">): PlaybookRuleContextRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    action_key: "send_message",
    topic: partial.topic ?? "commercial_deposit_retainer",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction: partial.instruction,
    source_type: "test",
    confidence_label: "explicit",
    is_active: true,
    ...partial,
  };
}

describe("buildUnknownPolicySignals — numeric commercial grounding", () => {
  it("CRM-only / no playbook: emits no-playbook lockdown plus deposit and travel unknowns", () => {
    const sig = buildUnknownPolicySignals([], commercialHarnessInbound);
    expect(sig.some((s) => s.includes("NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT"))).toBe(true);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT"))).toBe(true);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_TRAVEL_RADIUS"))).toBe(true);
  });

  it("with verified playbook rows matching harness: does not emit deposit/travel unknowns", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        topic: "commercial_deposit_retainer",
        instruction:
          "Booking retainer: common practice 30% retainer to hold a date when contract specifies — never invent 50% unless verified.",
      }),
      rule({
        topic: "package_elite_collection_verified",
        instruction:
          "Verified — Elite collection: 30% retainer holds date when contract reflects it; engagement travel within 50 miles of Florence included.",
      }),
    ];
    const sig = buildUnknownPolicySignals(rows, commercialHarnessInbound);
    expect(sig.some((s) => s.includes("NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT"))).toBe(false);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT"))).toBe(false);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_TRAVEL_RADIUS"))).toBe(false);
  });

  it("playbook without numeric % still triggers deposit unknown when client asks", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        topic: "commercial_deposit_retainer",
        instruction: "Align deposit terms with the signed contract; do not guess.",
      }),
    ];
    const sig = buildUnknownPolicySignals(rows, "What is the deposit to hold our date?");
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT"))).toBe(true);
  });
});

describe("buildOrchestratorFactsForPersonaWriter — commercial starvation fallback", () => {
  const dc: DecisionContext = {
    contextVersion: 1,
    photographerId: "p",
    weddingId: "w",
    threadId: "t",
    replyChannel: "email",
    rawMessage: "",
    crmSnapshot: emptyCrmSnapshot(),
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
      visibilityClass: "mixed_audience",
      clientVisibleForPrivateCommercialRedaction: true,
      approvalContactPersonIds: [],
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
  } as DecisionContext;

  const chosenFacts: OrchestratorProposalCandidate = {
    id: "c1",
    action_family: "send_message",
    action_key: "send_message",
    rationale: "Concise follow-up.",
    verifier_gating_required: false,
    likely_outcome: "draft",
    blockers_or_missing_facts: [],
  };

  const playbookNoPct: PlaybookRuleContextRow[] = [
    rule({
      topic: "general",
      instruction: "Be professional; defer to contract for terms.",
    }),
  ];

  it("appends full starvation fallback (before write instruction) when rationale lacks starvation action_constraint marker", () => {
    const raw =
      "[replay] Please confirm next steps. (Internal: planner commission was discussed offline.)";
    const facts = buildOrchestratorFactsForPersonaWriter(
      chosenFacts,
      raw,
      playbookNoPct,
      null,
      dc,
      { mode: "none" },
      null,
    );
    expect(facts).toContain(ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER);
    expect(facts).toContain("booking_next_step_instructions:");
    expect(facts).toContain("_CRITICAL_ORCHESTRATOR_CONSTRAINT:");
    const lastStarve = facts.lastIndexOf(ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER);
    const lastWrite = facts.lastIndexOf("Write a single client-facing reply email body.");
    expect(lastStarve).toBeGreaterThan(-1);
    expect(lastWrite).toBeGreaterThan(lastStarve);
  });

  it("uses proximity-only starvation block when rationale already includes COMMERCIAL_FINANCIAL_STARVATION from action_constraints", () => {
    const raw = "Hello";
    const chosenWithSuffix: OrchestratorProposalCandidate = {
      ...chosenFacts,
      rationale: `Prior text. Constraints: ${COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER}: test.`,
    };
    const facts = buildOrchestratorFactsForPersonaWriter(
      chosenWithSuffix,
      raw,
      playbookNoPct,
      null,
      dc,
      { mode: "none" },
      null,
    );
    expect(facts).toContain(ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER);
    expect(facts).not.toContain("booking_next_step_instructions:");
    expect(facts).toContain("_CRITICAL_ORCHESTRATOR_CONSTRAINT:");
  });

  it("still appends starvation when CRM has contract_value but playbook lacks payment-term grounding", () => {
    const raw = "Hello";
    const dcWithCrm: DecisionContext = {
      ...dc,
      crmSnapshot: { ...emptyCrmSnapshot(), contract_value: 5000 },
    };
    const facts = buildOrchestratorFactsForPersonaWriter(
      chosenFacts,
      raw,
      playbookNoPct,
      null,
      dcWithCrm,
      { mode: "none" },
      null,
    );
    expect(facts).toContain(ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER);
  });

  it("client-visible audience redacts planner-private phrases in the assembled persona facts block without dropping starvation guardrails", () => {
    const raw =
      "[replay] Please confirm next steps. (Internal: planner commission was discussed offline.)";
    const chosenWithLeak: OrchestratorProposalCandidate = {
      ...chosenFacts,
      rationale: "Escalation: internal negotiation referenced agency fee with planner.",
    };
    const facts = buildOrchestratorFactsForPersonaWriter(
      chosenWithLeak,
      raw,
      playbookNoPct,
      null,
      dc,
      { mode: "none" },
      null,
    );
    expect(facts).toContain("planner commission");
    expect(facts).toContain("agency fee");
    const redacted = redactPersonaWriterFactsBlockForAudience(facts, {
      clientVisibleForPrivateCommercialRedaction: true,
    });
    expect(redacted).not.toMatch(/planner\s+commission/i);
    expect(redacted).not.toMatch(/agency\s+fee/i);
    expect(redacted).toContain(ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER);
    expect(redacted).toContain("Write a single client-facing reply email body.");
  });

  it("planner-only audience leaves persona facts wording unchanged", () => {
    const raw =
      "[replay] Please confirm next steps. (Internal: planner commission was discussed offline.)";
    const chosenWithLeak: OrchestratorProposalCandidate = {
      ...chosenFacts,
      rationale: "Escalation: internal negotiation referenced agency fee with planner.",
    };
    const facts = buildOrchestratorFactsForPersonaWriter(
      chosenWithLeak,
      raw,
      playbookNoPct,
      null,
      { ...dc, audience: { ...dc.audience, clientVisibleForPrivateCommercialRedaction: false } },
      { mode: "none" },
      null,
    );
    const passthrough = redactPersonaWriterFactsBlockForAudience(facts, {
      clientVisibleForPrivateCommercialRedaction: false,
    });
    expect(passthrough).toBe(facts);
    expect(passthrough).toContain("planner commission");
  });
});
