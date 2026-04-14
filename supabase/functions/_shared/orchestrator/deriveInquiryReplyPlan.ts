/**
 * Deterministic inquiry reply-plan for `crmSnapshot.stage === "inquiry"` client orchestrator drafts.
 * See `src/types/inquiryReplyPlan.types.ts` for the schema.
 */
import type {
  DecisionContext,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import type { BudgetClauseMode, InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import { PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER } from "../prompts/personaConsultationFirstRealization.ts";
import { PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER } from "../prompts/personaWeakAvailabilityRealization.ts";
import { buildUnknownPolicySignals } from "./commercialPolicySignals.ts";
import type { BudgetStatementInjectionPlan } from "./budgetStatementInjection.ts";

export const INQUIRY_REPLY_STRATEGY_SECTION_TITLE = "=== Approved inquiry reply strategy (authoritative) ===";

/** Present in facts when availability turn forbids invented booking-process prose (see {@link buildInquiryReplyStrategyFactsSection}). */
export const INQUIRY_REPLY_BOOKING_PROCESS_FORBIDDEN_MARKER = "booking_process_words: forbidden";

/** Present when plan is consultation_first + call — triggers consultation-first voice realization addendum in persona writer. */
export const INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER = "inquiry_turn: consultation_first_cta_call";

/**
 * Weak availability: confirm date availability without verified booking-process playbook — triggers
 * {@link PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER} addendum in persona writer.
 */
export const INQUIRY_REPLY_WEAK_AVAILABILITY_ONLY_MARKER = "inquiry_turn: weak_availability_only_no_booking_detail";

export function isWeakAvailabilityInquiryPlan(plan: InquiryReplyPlan): boolean {
  return (
    plan.confirm_availability === true &&
    plan.mention_booking_terms === "none" &&
    plan.cta_type === "none"
  );
}

function getWeddingStage(dc: DecisionContext): string | null {
  const st = dc.crmSnapshot?.["stage"];
  return typeof st === "string" ? st.trim() : null;
}

export function isInquiryStageDecisionContext(dc: DecisionContext): boolean {
  const s = getWeddingStage(dc);
  return s !== null && s.toLowerCase() === "inquiry";
}

/**
 * True when active playbook text documents booking/hold/contract in enough detail to allow
 * `verified_specific` booking-term mention on availability turns — and unknown-policy lockdown is not active.
 */
export function bookingTermsMentionAllowedByPlaybookSnapshot(
  playbookRules: PlaybookRuleContextRow[],
  rawMessage: string,
): boolean {
  const active = playbookRules.filter((r) => r.is_active !== false);
  if (active.length === 0) return false;

  const unknown = buildUnknownPolicySignals(playbookRules, rawMessage);
  if (unknown.some((s) => s.includes("NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT"))) {
    return false;
  }

  const blob = active.map((r) => `${r.topic ?? ""} ${r.instruction ?? ""}`).join("\n").toLowerCase();
  return /\b(signed\s+)?contract\b|\bretainer\b\s+.{0,40}\b(hold|date|booking)\b|\bbooking\s+process\b|\bto\s+secure\b|\bsecure\s+your\s+date\b/.test(
    blob,
  );
}

/** Date / venue / CRM alignment clarification (not availability shopping). */
export function detectDateOrVenueClarifyAsk(rawMessage: string): boolean {
  return (
    /\bwhich date\b|\bvenue contract\b|\bupdate anything\?|\bon file for us\b|\bshould we update\b/i.test(
      rawMessage,
    ) || /\blisted\b.+\bform\b.+\bbut\b.+\bcontract\b/i.test(rawMessage)
  );
}

/** Asks whether the studio is available for a date / timeline / next steps (availability-shaped). */
export function detectAvailabilityAsk(rawMessage: string): boolean {
  return /\b(?:are you )?available\b|\bavailability\b|\bavailable for\b/i.test(rawMessage);
}

export type DeriveInquiryReplyPlanInput = {
  decisionContext: DecisionContext;
  rawMessage: string;
  playbookRules: PlaybookRuleContextRow[];
  budgetPlan: BudgetStatementInjectionPlan;
};

export function budgetClauseModeFromBudgetPlan(budgetPlan: BudgetStatementInjectionPlan): BudgetClauseMode {
  if (budgetPlan.mode === "inject") return "deterministic_minimum_pivot";
  if (budgetPlan.mode === "blocked_missing_pricing_data") return "blocked_missing_pricing_data";
  return "none";
}

/**
 * Returns null when the wedding is not in **inquiry** stage — writer receives no strategy block.
 */
export function deriveInquiryReplyPlan(input: DeriveInquiryReplyPlanInput): InquiryReplyPlan | null {
  if (!isInquiryStageDecisionContext(input.decisionContext)) return null;

  const raw = input.rawMessage;
  const { budgetPlan, playbookRules } = input;

  if (detectDateOrVenueClarifyAsk(raw)) {
    return {
      schemaVersion: 1,
      inquiry_motion: "clarify_only",
      confirm_availability: false,
      mention_booking_terms: "none",
      budget_clause_mode: budgetClauseModeFromBudgetPlan(budgetPlan),
      opening_tone: "crisp",
      cta_type: "clarification",
    };
  }

  if (budgetPlan.mode === "inject") {
    return {
      schemaVersion: 1,
      inquiry_motion: "consultation_first",
      confirm_availability: false,
      mention_booking_terms: "generic",
      budget_clause_mode: "deterministic_minimum_pivot",
      opening_tone: "firm",
      cta_type: "call",
    };
  }

  if (budgetPlan.mode === "blocked_missing_pricing_data") {
    return {
      schemaVersion: 1,
      inquiry_motion: "consultation_first",
      confirm_availability: false,
      mention_booking_terms: "none",
      budget_clause_mode: "blocked_missing_pricing_data",
      opening_tone: "firm",
      cta_type: "none",
    };
  }

  if (detectAvailabilityAsk(raw)) {
    const gate = bookingTermsMentionAllowedByPlaybookSnapshot(playbookRules, raw);
    if (gate) {
      return {
        schemaVersion: 1,
        inquiry_motion: "consultation_first",
        confirm_availability: true,
        mention_booking_terms: "verified_specific",
        budget_clause_mode: "none",
        opening_tone: "reassuring",
        cta_type: "call",
      };
    }
    /** Weak playbook support: confirm date only — no consultation funnel or invented booking terms. */
    return {
      schemaVersion: 1,
      inquiry_motion: "qualify_first",
      confirm_availability: true,
      mention_booking_terms: "none",
      budget_clause_mode: "none",
      opening_tone: "reassuring",
      cta_type: "none",
    };
  }

  return {
    schemaVersion: 1,
    inquiry_motion: "consultation_first",
    confirm_availability: false,
    mention_booking_terms: "generic",
    budget_clause_mode: "none",
    opening_tone: "warm",
    cta_type: "call",
  };
}

/** Compact facts block (no second mini-spec). */
export function buildInquiryReplyStrategyFactsSection(plan: InquiryReplyPlan): string {
  const lines = [
    INQUIRY_REPLY_STRATEGY_SECTION_TITLE,
    `motion: ${plan.inquiry_motion} | tone: ${plan.opening_tone}`,
    `confirm_availability: ${plan.confirm_availability ? "yes" : "no"}`,
    `booking_terms: ${plan.mention_booking_terms}`,
    `budget_clause: ${plan.budget_clause_mode}`,
    `cta: ${plan.cta_type}`,
  ];
  if (plan.confirm_availability && plan.mention_booking_terms === "none") {
    lines.push(
      `${INQUIRY_REPLY_BOOKING_PROCESS_FORBIDDEN_MARKER} — do not mention retainer, deposit, contract signing order, booking %, invoice/installment/milestone payment language, or a lead-photographer consultation funnel; availability confirmation + at most one light, generic next step (no calendar/deposit mechanics).`,
    );
  }
  if (isWeakAvailabilityInquiryPlan(plan)) {
    lines.push(
      `${INQUIRY_REPLY_WEAK_AVAILABILITY_ONLY_MARKER} — prose realization only: follow the appended block starting with ${PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER} in this user message (not policy facts).`,
    );
  }
  if (plan.inquiry_motion === "consultation_first" && plan.cta_type === "call") {
    lines.push(
      `${INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER} — prose realization only: follow the appended block starting with ${PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER} in this user message (not policy facts).`,
    );
  }
  lines.push(
    "Do not substitute a different motion or CTA. Realize this strategy in prose; facts only from verified blocks below.",
  );
  return lines.join("\n");
}
