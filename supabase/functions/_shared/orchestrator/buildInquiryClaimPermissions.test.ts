import { describe, expect, it } from "vitest";
import type { DecisionContext, PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import { deriveInquiryReplyPlan } from "./deriveInquiryReplyPlan.ts";
import { buildInquiryClaimPermissions } from "./buildInquiryClaimPermissions.ts";

function dc(stage: string, inquiryFirstStepStyle?: DecisionContext["inquiryFirstStepStyle"]): DecisionContext {
  return {
    crmSnapshot: { ...emptyCrmSnapshot(), stage: stage as never },
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
    inquiryFirstStepStyle: inquiryFirstStepStyle ?? "proactive_call",
  } as DecisionContext;
}

function rule(instruction: string): PlaybookRuleContextRow {
  return {
    id: "r1",
    action_key: "send_message",
    topic: "test",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction,
    source_type: "test",
    confidence_label: "explicit",
    is_active: true,
  };
}

describe("buildInquiryClaimPermissions", () => {
  it("sets availability defer when playbook lacks explicit availability confirmation pattern", () => {
    const raw = "Are you available next June?";
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry"),
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry"),
      playbookRules: [],
      inquiryReplyPlan: plan,
      rawMessage: raw,
    });
    expect(p.availability).toBe("defer");
  });

  it("sets availability confirm when playbook confirms availability and plan uses verified_specific booking terms", () => {
    const raw = "Are you available next June?";
    const playbook = [
      rule("After the couple confirms their date, we confirm availability on our calendar and send a hold summary."),
      rule("After signed contract, retainer holds the date."),
    ];
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry"),
      rawMessage: raw,
      playbookRules: playbook,
      budgetPlan: { mode: "none" },
    })!;
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry"),
      playbookRules: playbook,
      inquiryReplyPlan: plan,
      rawMessage: raw,
    });
    expect(plan.confirm_availability).toBe(true);
    expect(plan.mention_booking_terms).toBe("verified_specific");
    expect(p.availability).toBe("confirm");
  });

  it("sets destination_fit explore when playbook does not support destination services", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry"),
      rawMessage: "Hi — portfolio question [c]",
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry"),
      playbookRules: [],
      inquiryReplyPlan: plan,
      rawMessage: "Hi — portfolio question [c]",
    });
    expect(p.destination_fit).toBe("explore");
    expect(p.destination_logistics).toBe("explore");
  });

  it("sets destination_fit confirm when playbook documents destination photography", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry"),
      rawMessage: "Hi [c]",
      playbookRules: [rule("We photograph destination weddings and document travel in the proposal.")],
      budgetPlan: { mode: "none" },
    })!;
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry"),
      playbookRules: [rule("We photograph destination weddings and document travel in the proposal.")],
      inquiryReplyPlan: plan,
      rawMessage: "Hi [c]",
    });
    expect(p.destination_fit).toBe("confirm");
  });

  it("sets booking_next_step confirm when inquiry plan CTA is call", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry"),
      rawMessage: "Hi — love your work [c]",
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    expect(plan.cta_type).toBe("call");
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry"),
      playbookRules: [],
      inquiryReplyPlan: plan,
      rawMessage: "Hi — love your work [c]",
    });
    expect(p.booking_next_step).toBe("confirm");
  });

  it("sets booking_next_step soft_confirm when planner sets soft call intensity", () => {
    const raw = "Hi — love your work for our June 2026 wedding [c]";
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry", "soft_call"),
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    expect(plan.cta_intensity).toBe("soft");
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry", "soft_call"),
      playbookRules: [],
      inquiryReplyPlan: plan,
      rawMessage: raw,
    });
    expect(p.booking_next_step).toBe("soft_confirm");
  });

  it("sets booking_next_step explore when no_call_push removes proactive call CTA", () => {
    const raw = "Hi — love your work for our June 2026 wedding [c]";
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry", "no_call_push"),
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    expect(plan.cta_type).toBe("none");
    expect(plan.cta_intensity).toBe("none");
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry", "no_call_push"),
      playbookRules: [],
      inquiryReplyPlan: plan,
      rawMessage: raw,
    });
    expect(p.booking_next_step).toBe("explore");
  });

  it("downgrades offering_fit to explore with empty playbook (no verified policy snapshot)", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry"),
      rawMessage: "Hi [c]",
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry"),
      playbookRules: [],
      inquiryReplyPlan: plan,
      rawMessage: "Hi [c]",
    });
    expect(p.offering_fit).toBe("explore");
  });

  it("uses soft_confirm for offering_fit when playbook exists and no numeric lockdown", () => {
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc("inquiry"),
      rawMessage: "Hi [c]",
      playbookRules: [rule("We reply within one business day.")],
      budgetPlan: { mode: "none" },
    })!;
    const p = buildInquiryClaimPermissions({
      decisionContext: dc("inquiry"),
      playbookRules: [rule("We reply within one business day.")],
      inquiryReplyPlan: plan,
      rawMessage: "Hi [c]",
    });
    expect(p.offering_fit).toBe("soft_confirm");
  });
});
