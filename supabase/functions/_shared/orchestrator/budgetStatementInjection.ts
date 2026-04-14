/**
 * Narrow deterministic **budget minimum** clause for client-orchestrator persona drafts:
 * the model reserves `{{BUDGET_STATEMENT}}`; code injects the exact verified sentence(s) from playbook text.
 *
 * Scope: high-risk, repeated pattern only — not general templating for whole emails.
 */
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";

export const BUDGET_STATEMENT_PLACEHOLDER = "{{BUDGET_STATEMENT}}";

/** Stable for tests — matches the placeholder token (fresh RegExp; safe to reuse). */
export function budgetStatementPlaceholderPattern(): RegExp {
  return /\{\{\s*BUDGET_STATEMENT\s*\}\}/g;
}

function playbookBlob(rules: PlaybookRuleContextRow[]): string {
  return rules
    .filter((r) => r.is_active !== false)
    .map((r) => `${r.topic ?? ""} ${r.instruction ?? ""}`)
    .join("\n");
}

function normalizeUsdToken(raw: string): number {
  const n = parseInt(raw.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
}

/** All $ amounts appearing in verified playbook text (for post-injection auditing). */
export function extractPlaybookUsdAmounts(playbookConcat: string): number[] {
  const set = new Set<number>();
  for (const m of playbookConcat.matchAll(/\$\s*([\d,]+)/g)) {
    const v = normalizeUsdToken(m[1] ?? "");
    if (Number.isFinite(v) && v >= 100 && v < 1_000_000) set.add(v);
  }
  for (const m of playbookConcat.matchAll(/\$\s*(\d{1,3})\s*k\b/gi)) {
    const v = Number(m[1]) * 1000;
    if (Number.isFinite(v) && v >= 100 && v < 1_000_000) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * True when active playbook text documents a usable studio minimum / investment floor with a dollar anchor.
 * Single gate for {@link buildApprovedBudgetParagraphFromPlaybook} — avoids drift vs a separate pre-check.
 */
export function playbookBlobHasMinimumInvestmentSemantics(blob: string): boolean {
  const lc = blob.toLowerCase();
  const hasDollarAnchor = /\$\s*[\d,]+/.test(blob) || /\$\s*\d{1,3}\s*k\b/i.test(blob);
  if (!hasDollarAnchor) return false;
  return (
    /\bminimum\b/.test(lc) ||
    /\bstarting\s+investment\b/.test(lc) ||
    /\binvestment\s+is\b/.test(lc) ||
    /\binvestment\s+for\b/.test(lc) ||
    /\blocal\s+wedding/.test(lc) ||
    /\bdestination\s+wedding/.test(lc) ||
    /\bstarts\s+at\s+\$/i.test(blob)
  );
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

/**
 * Builds the exact paragraph injected in place of {{BUDGET_STATEMENT}} from playbook copy.
 * Uses smallest / largest distinct amounts when two or more are present (local vs destination heuristic).
 */
export function buildApprovedBudgetParagraphFromPlaybook(rules: PlaybookRuleContextRow[]): string | null {
  const blob = playbookBlob(rules);
  if (!playbookBlobHasMinimumInvestmentSemantics(blob)) return null;
  const amounts = extractPlaybookUsdAmounts(blob);
  if (amounts.length === 0) return null;

  if (amounts.length === 1) {
    return `To ensure we are aligned, our minimum starting investment for local weddings is ${formatUsd(amounts[0]!)}.`;
  }
  const local = amounts[0]!;
  const dest = amounts[amounts.length - 1]!;
  if (local === dest) {
    return `To ensure we are aligned, our minimum starting investment for local weddings is ${formatUsd(local)}.`;
  }
  return (
    `To ensure we are aligned, our minimum starting investment for local weddings is ${formatUsd(local)}. ` +
    `For destination weddings, our minimum starting investment is ${formatUsd(dest)}.`
  );
}

/** Client is asking whether their range / budget fits what the studio offers. */
export function detectInboundBudgetFitQuestion(rawMessage: string): boolean {
  const t = rawMessage.toLowerCase();
  const hasMoneyCue =
    /\$\s*[\d,]+|[€£]\s*[\d,]+|\b\d{1,3}\s*[-–]\s*\d{1,3}\s*k\b|\b\d+k\b/i.test(rawMessage) ||
    /\b\d{1,3}(?:,\d{3})+\b/.test(rawMessage);
  const asksFit =
    /\b(budget|ballpark|range|afford|investment|pricing|what you offer|in the ballpark|generally|expect|realistic)\b/.test(t);
  return hasMoneyCue && asksFit;
}

export type BudgetStatementInjectionPlan =
  | { mode: "none" }
  | {
      mode: "inject";
      approvedParagraph: string;
      /** Dollar amounts that may appear in the final email (from playbook extraction). */
      allowedUsdAmounts: number[];
    }
  /** Inbound is budget-fit priced but playbook cannot supply a verified minimum paragraph — fail closed (no freeform persona pricing). */
  | { mode: "blocked_missing_pricing_data"; code: "MISSING_PRICING_DATA" };

/** Instruction_history step when persona is skipped because verified minimum-investment copy is absent. */
export const V3_PRICING_DATA_GUARDRAIL_STEP = "v3_pricing_data_guardrail_missing_verified_minimum";

/** Appended to draft body when guardrail applies — deterministic, operator-visible; not client-sendable prose. */
export const V3_PRICING_GUARDRAIL_BODY_MARKER = "[V3 pricing guardrail]";

export function planBudgetStatementInjection(
  rawMessage: string,
  playbookRules: PlaybookRuleContextRow[],
): BudgetStatementInjectionPlan {
  if (!detectInboundBudgetFitQuestion(rawMessage)) return { mode: "none" };
  const approved = buildApprovedBudgetParagraphFromPlaybook(playbookRules);
  if (!approved) {
    return { mode: "blocked_missing_pricing_data", code: "MISSING_PRICING_DATA" };
  }

  const blob = playbookBlob(playbookRules);
  return {
    mode: "inject",
    approvedParagraph: approved,
    allowedUsdAmounts: extractPlaybookUsdAmounts(blob),
  };
}

/** User-message block appended to orchestrator facts when injection is active. */
export function buildBudgetStatementSlotFactsSection(): string {
  return [
    "",
    "=== BUDGET STATEMENT SLOT (mandatory for this turn) ===",
    `The reply must state verified studio minimum investment using this **exact placeholder token once** in email_draft (copy the braces exactly): ${BUDGET_STATEMENT_PLACEHOLDER}`,
    "Do not write any dollar amounts for studio minimums, pricing floors, or package totals yourself.",
    "Do not restate, quote, or acknowledge the client's budget numbers or range.",
    "Write your opening warmth and next steps normally; the placeholder stands in for the exact policy sentence(s) inserted by the system after you respond.",
  ].join("\n");
}

export function applyBudgetStatementPlaceholder(emailDraft: string, approvedParagraph: string): string {
  return emailDraft.replace(/\{\{\s*BUDGET_STATEMENT\s*\}\}/g, approvedParagraph);
}

export function hasBudgetStatementPlaceholder(emailDraft: string): boolean {
  return /\{\{\s*BUDGET_STATEMENT\s*\}\}/.test(emailDraft);
}

export function countBudgetStatementPlaceholders(emailDraft: string): number {
  const m = emailDraft.match(/\{\{\s*BUDGET_STATEMENT\s*\}\}/g);
  return m?.length ?? 0;
}

function extractUsdAmountsFromProse(emailLc: string): number[] {
  const out: number[] = [];
  for (const m of emailLc.matchAll(/\$\s*([\d,]+)/g)) {
    const v = normalizeUsdToken(m[1] ?? "");
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

const FORBIDDEN_BUDGET_SOFTENING: RegExp[] = [
  /\bi\s+appreciate\s+you\s+sharing\s+your\s+budget\b/i,
  /\bappreciate\s+you\s+sharing\s+your\s+(?:budget\s+range|range)\b/i,
  /\bthanks?\s+for\s+sharing\s+your\s+budget\b/i,
  /\bi\s+know\s+that\s+is\s+above\s+your\s+range\b/i,
  /\bi\s+know\s+that\s+(?:it\s+)?may\s+(?:land|sit)\b/i,
  /\bhigher\s+than\s+your\s+(?:initial\s+)?range\b/i,
  /\b(?:a\s+bit\s+)?above\s+what\s+you(?:'re|\s+are)\s+currently\s+budgeting\b/i,
  /\byour\s+(?:stated\s+)?(?:range|budget)\s+is\b/i,
  /\bregarding\s+your\s+budget\b/i,
];

/**
 * After placeholder injection: every `$` amount in the email must be allowed by playbook extraction.
 * When injection is active, also block known forbidden “gap softening” phrases.
 */
export function auditBudgetStatementFinalEmail(
  emailDraft: string,
  plan: Extract<BudgetStatementInjectionPlan, { mode: "inject" }>,
): string[] {
  const violations: string[] = [];
  const lc = emailDraft.toLowerCase();

  if (countBudgetStatementPlaceholders(emailDraft) > 1) {
    violations.push("email_draft must include the budget placeholder at most once.");
  }

  if (hasBudgetStatementPlaceholder(emailDraft)) {
    violations.push(
      `email_draft still contains ${BUDGET_STATEMENT_PLACEHOLDER} after injection — post-processor failed.`,
    );
  }

  const amounts = extractUsdAmountsFromProse(lc);
  const allowed = new Set(plan.allowedUsdAmounts);
  for (const a of amounts) {
    if (!allowed.has(a)) {
      violations.push(
        `email_draft asserts USD amount $${a.toLocaleString("en-US")} not present in verified playbook_rules dollar set for this turn.`,
      );
    }
  }

  for (const re of FORBIDDEN_BUDGET_SOFTENING) {
    if (re.test(emailDraft)) {
      violations.push(
        "email_draft uses forbidden budget-gap softening or client-budget acknowledgement phrasing (BUDGET OVERRIDE).",
      );
      break;
    }
  }

  return [...new Set(violations)];
}

/**
 * Before injection: model must include the placeholder when injection plan is active.
 */
export function auditBudgetStatementPlaceholderPresent(emailDraft: string): string[] {
  if (hasBudgetStatementPlaceholder(emailDraft)) return [];
  return [
    `required token ${BUDGET_STATEMENT_PLACEHOLDER} missing from email_draft — model must reserve the slot without writing its own minimum-investment dollar paragraph.`,
  ];
}
