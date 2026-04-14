import { describe, expect, it } from "vitest";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { V3_INQUIRY_WRITING_QA_MINIMUM_INSTRUCTION } from "../../../../scripts/v3_inquiry_writing_qa_seed.ts";
import {
  BUDGET_STATEMENT_PLACEHOLDER,
  applyBudgetStatementPlaceholder,
  auditBudgetStatementFinalEmail,
  auditBudgetStatementPlaceholderPresent,
  buildApprovedBudgetParagraphFromPlaybook,
  detectInboundBudgetFitQuestion,
  extractPlaybookUsdAmounts,
  planBudgetStatementInjection,
  playbookBlobHasMinimumInvestmentSemantics,
} from "./budgetStatementInjection.ts";

/** Mirrors `v3_inquiry_writing_qa_seed` inquiry_budget_sensitive inbound (no correlation tag). */
const HOSTED_INQUIRY_BUDGET_SENSITIVE_RAW =
  "We're trying to keep photography around $8k–$10k if we can — is that generally in the ballpark for what you offer, or should we expect something different? Totally fine either way, just planning.";

function rule(partial: Partial<PlaybookRuleContextRow> & Pick<PlaybookRuleContextRow, "instruction">): PlaybookRuleContextRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    action_key: "send_message",
    topic: partial.topic ?? "commercial_minimum",
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

describe("budgetStatementInjection", () => {
  it("detectInboundBudgetFitQuestion matches inquiry-style budget ask", () => {
    const raw =
      "We're trying to keep photography around $8k–$10k if we can — is that generally in the ballpark for what you offer, or should we expect something different?";
    expect(detectInboundBudgetFitQuestion(raw)).toBe(true);
  });

  it("planBudgetStatementInjection activates when inbound asks budget fit and playbook has minimums", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        topic: "minimum_investment",
        instruction:
          "Minimum starting investment is $10,000 for local weddings and $15,000 for destination weddings. Do not negotiate floors.",
      }),
    ];
    const raw =
      "is $8k–$10k in the ballpark for what you offer?";
    const plan = planBudgetStatementInjection(raw, rows);
    expect(plan.mode).toBe("inject");
    if (plan.mode === "inject") {
      expect(plan.approvedParagraph).toContain("$10,000");
      expect(plan.approvedParagraph).toContain("$15,000");
      expect(plan.allowedUsdAmounts).toEqual([10000, 15000]);
    }
  });

  it("hosted-shaped budget inquiry + investment_for playbook activates inject (semantics gate alignment)", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        topic: "commercial_minimum",
        instruction:
          "Investment for local weddings starts at $10,000; destination from $15,000. Verified policy only.",
      }),
    ];
    expect(detectInboundBudgetFitQuestion(HOSTED_INQUIRY_BUDGET_SENSITIVE_RAW)).toBe(true);
    const plan = planBudgetStatementInjection(HOSTED_INQUIRY_BUDGET_SENSITIVE_RAW, rows);
    expect(plan.mode).toBe("inject");
    if (plan.mode === "inject") {
      expect(plan.approvedParagraph).toContain("$10,000");
      expect(plan.allowedUsdAmounts).toContain(10000);
    }
  });

  it("stays off when inbound is not a budget-fit question despite playbook minimums", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        instruction: "Minimum starting investment is $10,000 for local weddings.",
      }),
    ];
    const raw = "We love your portfolio — can we book a call to discuss our June wedding?";
    expect(planBudgetStatementInjection(raw, rows).mode).toBe("none");
  });

  it("blocks with MISSING_PRICING_DATA when inbound asks budget fit but playbook has no usable minimum copy", () => {
    const rows: PlaybookRuleContextRow[] = [rule({ instruction: "We love weddings and use natural light." })];
    const plan = planBudgetStatementInjection(HOSTED_INQUIRY_BUDGET_SENSITIVE_RAW, rows);
    expect(plan.mode).toBe("blocked_missing_pricing_data");
    if (plan.mode === "blocked_missing_pricing_data") {
      expect(plan.code).toBe("MISSING_PRICING_DATA");
    }
  });

  it("extractPlaybookUsdAmounts parses $Nk shorthand in playbook text", () => {
    expect(extractPlaybookUsdAmounts("Local from $10k minimum, destination $15,000.")).toEqual([10000, 15000]);
  });

  it("playbookBlobHasMinimumInvestmentSemantics accepts investment_for + dollar anchor", () => {
    const blob = "Investment for local weddings is $10,000.";
    expect(playbookBlobHasMinimumInvestmentSemantics(blob)).toBe(true);
  });

  it("hosted QA fixture instruction activates inject for budget-sensitive inbound", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        topic: "qa_minimum_investment_fixture",
        instruction: V3_INQUIRY_WRITING_QA_MINIMUM_INSTRUCTION,
      }),
    ];
    const plan = planBudgetStatementInjection(HOSTED_INQUIRY_BUDGET_SENSITIVE_RAW, rows);
    expect(plan.mode).toBe("inject");
    if (plan.mode === "inject") {
      expect(plan.approvedParagraph).toContain("$10,000");
      expect(plan.approvedParagraph).toContain("$15,000");
      expect(plan.allowedUsdAmounts).toEqual([10000, 15000]);
    }
  });

  it("applyBudgetStatementPlaceholder injects deterministic copy", () => {
    const approved = "To ensure we are aligned, our minimum starting investment for local weddings is $10,000.";
    const draft = `Hi,\n\n${BUDGET_STATEMENT_PLACEHOLDER}\n\nNext steps.`;
    expect(applyBudgetStatementPlaceholder(draft, approved)).not.toContain(BUDGET_STATEMENT_PLACEHOLDER);
    expect(applyBudgetStatementPlaceholder(draft, approved)).toContain("$10,000");
  });

  it("auditBudgetStatementPlaceholderPresent fails when token missing", () => {
    expect(auditBudgetStatementPlaceholderPresent("No placeholder here.").length).toBeGreaterThan(0);
    expect(auditBudgetStatementPlaceholderPresent(`Ok ${BUDGET_STATEMENT_PLACEHOLDER}`).length).toBe(0);
  });

  it("auditBudgetStatementFinalEmail rejects stray dollars", () => {
    const plan = {
      mode: "inject" as const,
      approvedParagraph: "x",
      allowedUsdAmounts: [10000, 15000],
    };
    const bad = "We are at $9,000 minimum for you.";
    const v = auditBudgetStatementFinalEmail(bad, plan);
    expect(v.some((x) => x.includes("$9,000"))).toBe(true);
  });

  it("auditBudgetStatementFinalEmail rejects budget-gap softening after injection body", () => {
    const plan = {
      mode: "inject" as const,
      approvedParagraph:
        "To ensure we are aligned, our minimum starting investment for local weddings is $10,000.",
      allowedUsdAmounts: [10000],
    };
    const bad =
      "Hi Casey,\n\nI know that may land higher than your initial range.\n\n" +
      plan.approvedParagraph +
      "\n\nNext steps.";
    const v = auditBudgetStatementFinalEmail(bad, plan);
    expect(v.some((x) => x.includes("forbidden budget-gap softening"))).toBe(true);
  });

  it("auditBudgetStatementFinalEmail rejects appreciate / may sit drift (hosted-shaped)", () => {
    const plan = {
      mode: "inject" as const,
      approvedParagraph:
        "To ensure we are aligned, our minimum starting investment for local weddings is $10,000.",
      allowedUsdAmounts: [10000],
    };
    const bad =
      "It's lovely to hear from you. I appreciate you sharing your budget range upfront—it helps.\n\n" +
      plan.approvedParagraph +
      "\n\nI know that may sit a bit above what you're currently budgeting.";
    const v = auditBudgetStatementFinalEmail(bad, plan);
    expect(v.some((x) => x.includes("forbidden budget-gap softening"))).toBe(true);
  });

  it("buildApprovedBudgetParagraphFromPlaybook returns null without minimum language", () => {
    const rows = [rule({ instruction: "We love weddings." })];
    expect(buildApprovedBudgetParagraphFromPlaybook(rows)).toBeNull();
  });

  it("extractPlaybookUsdAmounts collects dollar figures", () => {
    expect(extractPlaybookUsdAmounts("foo $10,000 bar $15,000")).toEqual([10000, 15000]);
  });
});
