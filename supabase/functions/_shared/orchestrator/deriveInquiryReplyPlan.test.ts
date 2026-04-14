/**
 * Inquiry reply-plan derivation — hosted QA-shaped scenarios.
 */
import { describe, expect, it } from "vitest";
import type { DecisionContext, PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import {
  bookingTermsMentionAllowedByPlaybookSnapshot,
  budgetClauseModeFromBudgetPlan,
  deriveInquiryReplyPlan,
  detectAvailabilityAsk,
  detectDateOrVenueClarifyAsk,
  buildInquiryReplyStrategyFactsSection,
  INQUIRY_REPLY_BOOKING_PROCESS_FORBIDDEN_MARKER,
  INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER,
  INQUIRY_REPLY_STRATEGY_SECTION_TITLE,
  INQUIRY_REPLY_WEAK_AVAILABILITY_ONLY_MARKER,
  isWeakAvailabilityInquiryPlan,
} from "./deriveInquiryReplyPlan.ts";
import { PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER } from "../prompts/personaWeakAvailabilityRealization.ts";
import type { BudgetStatementInjectionPlan } from "./budgetStatementInjection.ts";
import { buildOrchestratorFactsForPersonaWriter } from "./maybeRewriteOrchestratorDraftWithPersona.ts";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";

function mockDecisionContext(stage: string | undefined): DecisionContext {
  return {
    crmSnapshot: stage !== undefined ? { ...emptyCrmSnapshot(), stage: stage as never } : emptyCrmSnapshot(),
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
  } as DecisionContext;
}

function rule(instruction: string, topic = "test"): PlaybookRuleContextRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    action_key: "send_message",
    topic,
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction,
    source_type: "test",
    confidence_label: "explicit",
    is_active: true,
  };
}

describe("deriveInquiryReplyPlan", () => {
  const noneBudget: BudgetStatementInjectionPlan = { mode: "none" };

  it("returns null when stage is not inquiry", () => {
    const p = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("booked"),
      rawMessage: "Hello",
      playbookRules: [],
      budgetPlan: noneBudget,
    });
    expect(p).toBeNull();
  });

  it("inquiry_warm_onboarding: consultation_first, generic booking, warm tone", () => {
    const raw =
      "Hi there — we're getting married in fall 2026 and love your portfolio. Could we set up a short call to talk through coverage and what working with you looks like? [corr]";
    const p = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: raw,
      playbookRules: [rule("Minimum investment $10,000 local.")],
      budgetPlan: noneBudget,
    });
    expect(p).not.toBeNull();
    expect(p!.inquiry_motion).toBe("consultation_first");
    expect(p!.mention_booking_terms).toBe("generic");
    expect(p!.confirm_availability).toBe(false);
    expect(p!.budget_clause_mode).toBe("none");
    expect(p!.opening_tone).toBe("warm");
    expect(p!.cta_type).toBe("call");
  });

  it("inquiry_date_location_clarify: clarify_only, booking none", () => {
    const raw =
      "Quick question — we listed June 15 on your form but our venue contract says June 16 for the ceremony start. Which date do you have on file for us, and should we update anything? [corr]";
    const p = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: noneBudget,
    });
    expect(p!.inquiry_motion).toBe("clarify_only");
    expect(p!.mention_booking_terms).toBe("none");
    expect(p!.cta_type).toBe("clarification");
  });

  it("inquiry_availability_timeline: confirm availability, booking_terms none without playbook gate", () => {
    const raw =
      "Are you available for Saturday, September 12, 2026? We're trying to confirm core vendors in the next two weeks—what would next steps look like if you're open? [corr]";
    const p = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: raw,
      playbookRules: [rule("General tone guidance only — be helpful.")],
      budgetPlan: noneBudget,
    });
    expect(p!.confirm_availability).toBe(true);
    expect(p!.mention_booking_terms).toBe("none");
    expect(p!.opening_tone).toBe("reassuring");
    expect(p!.inquiry_motion).toBe("qualify_first");
    expect(p!.cta_type).toBe("none");
  });

  it("inquiry_availability: verified_specific when playbook gate passes", () => {
    const raw =
      "Are you available for Saturday, September 12, 2026? What are next steps? [corr]";
    const rows: PlaybookRuleContextRow[] = [
      rule(
        "Booking: signed contract and 30% retainer holds your date; we then send timeline details.",
        "booking_process",
      ),
    ];
    const p = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: raw,
      playbookRules: rows,
      budgetPlan: noneBudget,
    });
    expect(p!.mention_booking_terms).toBe("verified_specific");
    expect(p!.inquiry_motion).toBe("consultation_first");
    expect(p!.cta_type).toBe("call");
  });

  it("inquiry_budget_sensitive without verified minimum: blocked_missing_pricing_data", () => {
    const raw =
      "We're trying to keep photography around $8k–$10k — is that generally in the ballpark for what you offer, or should we expect something different? [corr]";
    const blocked: BudgetStatementInjectionPlan = {
      mode: "blocked_missing_pricing_data",
      code: "MISSING_PRICING_DATA",
    };
    const p = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: blocked,
    });
    expect(p!.budget_clause_mode).toBe("blocked_missing_pricing_data");
    expect(p!.mention_booking_terms).toBe("none");
    expect(p!.cta_type).toBe("none");
    expect(p!.opening_tone).toBe("firm");
    expect(budgetClauseModeFromBudgetPlan(blocked)).toBe("blocked_missing_pricing_data");
  });

  it("inquiry_budget_sensitive: deterministic_minimum_pivot when budgetPlan injects", () => {
    const raw =
      "We're trying to keep photography around $8k–$10k — is that generally in the ballpark for what you offer? [corr]";
    const inject: BudgetStatementInjectionPlan = {
      mode: "inject",
      approvedParagraph: "To ensure we are aligned...",
      allowedUsdAmounts: [10000, 15000],
    };
    const p = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: raw,
      playbookRules: [rule("Minimum starting investment is $10,000 for local weddings.")],
      budgetPlan: inject,
    });
    expect(p!.budget_clause_mode).toBe("deterministic_minimum_pivot");
    expect(p!.mention_booking_terms).toBe("generic");
    expect(p!.opening_tone).toBe("firm");
  });

  it("buildInquiryReplyStrategyFactsSection is compact", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: "Hello portfolio [c]",
      playbookRules: [],
      budgetPlan: noneBudget,
    })!;
    const block = buildInquiryReplyStrategyFactsSection(plan);
    expect(block).toContain(INQUIRY_REPLY_STRATEGY_SECTION_TITLE);
    expect(block.split("\n").length).toBeLessThanOrEqual(10);
    expect(block).toContain("motion:");
    expect(block).toContain("cta:");
    expect(block).not.toContain(INQUIRY_REPLY_BOOKING_PROCESS_FORBIDDEN_MARKER);
    expect(block).toContain(INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER);
  });

  it("buildInquiryReplyStrategyFactsSection adds booking restriction line for weak availability", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage:
        "Are you available for Saturday, September 12, 2026? Next steps if open? [corr]",
      playbookRules: [rule("Tone only.")],
      budgetPlan: noneBudget,
    })!;
    expect(isWeakAvailabilityInquiryPlan(plan!)).toBe(true);
    const block = buildInquiryReplyStrategyFactsSection(plan);
    expect(block).toContain(INQUIRY_REPLY_BOOKING_PROCESS_FORBIDDEN_MARKER);
    expect(block).toContain(INQUIRY_REPLY_WEAK_AVAILABILITY_ONLY_MARKER);
    expect(block).toContain(PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER);
    expect(block.split("\n").length).toBeLessThanOrEqual(12);
    expect(block).not.toContain(INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER);
  });
});

describe("detectors", () => {
  it("detectDateOrVenueClarifyAsk matches venue contract phrasing", () => {
    expect(detectDateOrVenueClarifyAsk("venue contract says June 16")).toBe(true);
  });

  it("detectAvailabilityAsk matches availability question", () => {
    expect(detectAvailabilityAsk("Are you available for Saturday")).toBe(true);
  });
});

const minimalSendMessageCandidate: OrchestratorProposalCandidate = {
  id: "00000000-0000-0000-0000-000000000099",
  action_family: "send_message",
  action_key: "send_message",
  rationale: "Draft a client-appropriate reply.",
  verifier_gating_required: false,
  likely_outcome: "draft",
  blockers_or_missing_facts: [],
};

describe("buildOrchestratorFactsForPersonaWriter + inquiry plan", () => {
  it("includes compact Approved inquiry reply strategy block when plan is set", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: mockDecisionContext("inquiry"),
      rawMessage: "Hi — portfolio question [c]",
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      "Hi — portfolio question [c]",
      [],
      null,
      mockDecisionContext("inquiry"),
      { mode: "none" },
      plan,
    );
    expect(facts).toContain(INQUIRY_REPLY_STRATEGY_SECTION_TITLE);
    expect(facts).toContain("motion:");
    expect(facts).toContain("cta:");
    const lineCount = facts.split("\n").length;
    expect(lineCount).toBeGreaterThan(10);
  });
});

describe("bookingTermsMentionAllowedByPlaybookSnapshot", () => {
  it("is false with empty playbook", () => {
    expect(bookingTermsMentionAllowedByPlaybookSnapshot([], "Are you available?")).toBe(false);
  });

  it("is true with contract + retainer hold language", () => {
    const rows = [
      rule("After signed contract, 30% retainer holds the date.", "commercial"),
    ];
    expect(bookingTermsMentionAllowedByPlaybookSnapshot(rows, "available Saturday?")).toBe(true);
  });
});
