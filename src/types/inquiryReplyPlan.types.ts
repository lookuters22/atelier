/**
 * Enterprise inquiry reply-plan — slice 1.
 * Policy/planning chooses communication strategy; the persona writer realizes it into prose.
 * Factual grounding remains in orchestrator facts + auditors (unchanged).
 */

export type InquiryMotion =
  | "consultation_first"
  | "send_packages_first"
  | "qualify_first"
  | "brochure_then_call"
  | "clarify_only";

export type MentionBookingTermsLevel = "none" | "generic" | "verified_specific";

export type BudgetClauseMode =
  | "none"
  | "deterministic_minimum_pivot"
  /** Budget-fit question but active playbook did not yield verified minimum-investment copy — persona must not improvise pricing. */
  | "blocked_missing_pricing_data";

export type InquiryOpeningTone = "warm" | "crisp" | "reassuring" | "firm";

export type InquiryCtaType = "call" | "packages" | "clarification" | "none";

/** Compact structured plan for inquiry-stage client orchestrator drafts. */
export type InquiryReplyPlan = {
  schemaVersion: 1;
  inquiry_motion: InquiryMotion;
  confirm_availability: boolean;
  mention_booking_terms: MentionBookingTermsLevel;
  budget_clause_mode: BudgetClauseMode;
  opening_tone: InquiryOpeningTone;
  cta_type: InquiryCtaType;
};
