/**
 * When verified playbook text does not carry **specific payment-term grounding** (deposit/retainer or
 * installment/schedule %), mixed-audience or high-broadcast-risk turns can still push the persona writer toward
 * “complete the booking email” and invite invented percentages. This module uses **structured** inputs
 * (effective playbook rules, audience, inquiry plan) — not inbound-text motion heuristics — to attach safe
 * guidance via `OrchestratorContextInjection.action_constraints` and a short last-read proximity block in
 * `buildOrchestratorFactsForPersonaWriter`.
 *
 * **Financial existence** (CRM `contract_value` / `balance_due`) is orthogonal: it proves commercial state
 * but does **not** prove deposit/installment structure is safe to state — starvation keys off missing
 * **specific payment-term grounding** only.
 */
import type {
  DecisionAudienceSnapshot,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import type { CrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import {
  buildActivePlaybookInstructionBlob,
  playbookBlobHasSpecificPaymentTermsGrounding,
} from "./commercialPolicySignals.ts";

/**
 * Deterministic **financial existence** on the scoped CRM snapshot (`weddings` row via `buildAgentContext` /
 * `loadCrmSnapshot`). Typed fields from `Database["public"]["Tables"]["weddings"]["Row"]`
 * (`contract_value`, `balance_due`) — not payment-schedule structure.
 */
const CRM_FINANCIAL_EXISTENCE_KEYS = ["balance_due", "contract_value"] as const;

/**
 * True when authoritative CRM carries at least one finite numeric value on a known commercial-total / balance field.
 * Null-safe. Does **not** imply deposit or installment percentages are known.
 */
export function hasFinancialGrounding(crmSnapshot: CrmSnapshot | Record<string, unknown> | null | undefined): boolean {
  if (crmSnapshot === null || crmSnapshot === undefined) return false;
  if (typeof crmSnapshot !== "object") return false;
  for (const key of CRM_FINANCIAL_EXISTENCE_KEYS) {
    const v = (crmSnapshot as Record<string, unknown>)[key];
    if (v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}

/**
 * **Specific payment-term grounding** from effective `playbook_rules` instructions (including text merged from
 * `authorized_case_exceptions` in `deriveEffectivePlaybook`). Deterministic % + deposit/retainer/installment
 * patterns — see `playbookBlobHasSpecificPaymentTermsGrounding`.
 *
 * No separate CRM columns in the current schema express deposit % or installment schedules; those are
 * reflected here only when present in effective playbook text.
 */
export function hasSpecificPaymentTermsGrounding(playbookRules: PlaybookRuleContextRow[]): boolean {
  const blob = buildActivePlaybookInstructionBlob(playbookRules);
  return playbookBlobHasSpecificPaymentTermsGrounding(blob);
}

/** Bounded snapshot for orchestrator / tests — separates existence from payment-term specificity. */
export type FinancialPolicyGrounding = {
  /** CRM has numeric `contract_value` and/or `balance_due`. */
  hasFinancialGrounding: boolean;
  /** Effective playbook blob has deterministic deposit/schedule % grounding. */
  hasSpecificPaymentTermsGrounding: boolean;
};

export function evaluateFinancialPolicyGrounding(
  playbookRules: PlaybookRuleContextRow[],
  crmSnapshot: CrmSnapshot | Record<string, unknown> | null | undefined,
): FinancialPolicyGrounding {
  return {
    hasFinancialGrounding: hasFinancialGrounding(crmSnapshot),
    hasSpecificPaymentTermsGrounding: hasSpecificPaymentTermsGrounding(playbookRules),
  };
}

/** @deprecated Use {@link hasFinancialGrounding}. */
export function crmHasGroundedFinancialTerms(crmSnapshot: CrmSnapshot | Record<string, unknown> | null | undefined): boolean {
  return hasFinancialGrounding(crmSnapshot);
}

/** Stable marker for tests, logs, and `chosen.rationale` bridging (suffix includes action_constraints). */
export const COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER = "COMMERCIAL_FINANCIAL_STARVATION";

/**
 * Positive writer-facing constraint merged into `action_constraints` → rationale suffix → persona (via orchestrator rationale).
 * Kept one line so it fits the bounded suffix budget alongside other constraints.
 */
export const ACTION_CONSTRAINT_COMMERCIAL_FINANCIAL_STARVATION =
  `${COMMERCIAL_DEPOSIT_STARVATION_ACTION_CONSTRAINT_MARKER}: Verified playbook_rules for this turn do not include typed grounding for a deposit/retainer percentage or payment-schedule percentages. Do not invent percentages. For booking or payment follow-up, confirm the official contract or studio team will specify the exact payment schedule and deposit terms.`;

/** Stable marker for tests and log inspection. */
export const ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER =
  "=== ORCHESTRATOR_SAFE_COMMERCIAL_COMPOSITION (read last — before drafting) ===";

function isPrimarySendMessageCandidate(chosen: OrchestratorProposalCandidate): boolean {
  return chosen.action_family === "send_message" && chosen.action_key === "send_message";
}

/**
 * Structured starvation: no **specific payment-term grounding** in the effective playbook blob,
 * **and** at least one of:
 * - mixed audience (planner + client / broadcast-sensitive)
 * - elevated broadcast risk
 * - inquiry reply plan that allows booking-process terms (non-`none` mention_booking_terms)
 *
 * CRM financial existence (`contract_value` / `balance_due`) does **not** suppress starvation.
 */
export function commercialDepositStarvationStructuredApplies(
  playbookRules: PlaybookRuleContextRow[],
  audience: DecisionAudienceSnapshot | null | undefined,
  inquiryReplyPlan: InquiryReplyPlan | null,
): boolean {
  if (hasSpecificPaymentTermsGrounding(playbookRules)) return false;
  if (!audience) return false;

  if (audience.visibilityClass === "mixed_audience") return true;
  if (audience.broadcastRisk === "high" || audience.broadcastRisk === "medium") return true;
  if (inquiryReplyPlan !== null && inquiryReplyPlan.mention_booking_terms !== "none") return true;
  return false;
}

/**
 * Last-read facts block for primary `send_message` when structured starvation applies.
 * Persona `chosen.rationale` usually already includes `ACTION_CONSTRAINT_COMMERCIAL_FINANCIAL_STARVATION` from
 * `formatOrchestratorContextInjectionRationaleSuffix`; in that case only the proximity `_CRITICAL_` line is duplicated.
 */
export function shouldAppendCommercialDepositStarvationLastMileFacts(
  playbookRules: PlaybookRuleContextRow[],
  chosen: OrchestratorProposalCandidate,
  audience: DecisionAudienceSnapshot | null | undefined,
  inquiryReplyPlan: InquiryReplyPlan | null,
): boolean {
  if (!isPrimarySendMessageCandidate(chosen)) return false;
  return commercialDepositStarvationStructuredApplies(playbookRules, audience, inquiryReplyPlan);
}

/** Full fallback when orchestrator rationale did not already carry the starvation action_constraint (e.g. unit tests). */
export function buildCommercialDepositStarvationFullFallbackFactsSection(): string {
  return [
    ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER,
    "",
    "booking_next_step_instructions: If the reply moves toward booking, contract signing, or payment timing, state that the **official contract** or **studio team** will specify the exact payment schedule and any deposit/retainer figures. Do **not** invent percentages to complete the email.",
    "",
    '_CRITICAL_ORCHESTRATOR_CONSTRAINT: Do not output any deposit, retainer, or payment-schedule percentage unless the **same numeric figure** appears under "Verified policy: playbook_rules" above. If those figures are absent, defer entirely (e.g. per your agreement / from the contract / the team will confirm exact terms) — **no fabricated %**.',
  ].join("\n");
}

/** Proximity-only block when positive guidance already appears in `action_constraints` / merged rationale. */
export function buildCommercialDepositStarvationLastMileProximityBlock(): string {
  return [
    ORCHESTRATOR_COMMERCIAL_STARVATION_SECTION_MARKER,
    "",
    '_CRITICAL_ORCHESTRATOR_CONSTRAINT: Do not output any deposit, retainer, or payment-schedule percentage unless the **same numeric figure** appears under "Verified policy: playbook_rules" above. If those figures are absent, defer entirely (e.g. per your agreement / from the contract / the team will confirm exact terms) — **no fabricated %**.',
  ].join("\n");
}
