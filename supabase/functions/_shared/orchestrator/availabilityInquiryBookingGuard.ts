/**
 * Narrow deterministic guard: when inquiry reply-plan restricts booking-process language
 * (`confirm_availability` + `mention_booking_terms: none`), reject prose that invents
 * retainer/deposit/contract-sequence language (common availability drift).
 */
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";

/** When true, {@link auditAvailabilityRestrictedBookingProse} applies. */
export function isAvailabilityBookingProseRestricted(plan: InquiryReplyPlan): boolean {
  return plan.confirm_availability === true && plan.mention_booking_terms === "none";
}

/**
 * Returns violation strings if the draft contains forbidden booking-process tokens.
 * Does not strip — merges with commercial auditor in the orchestrator persona path.
 */
export function auditAvailabilityRestrictedBookingProse(
  emailDraft: string,
  plan: InquiryReplyPlan | null,
): string[] {
  if (!plan || !isAvailabilityBookingProseRestricted(plan)) return [];

  const t = emailDraft;
  const v: string[] = [];

  if (/\bretainer\b/i.test(t)) {
    v.push(
      "email_draft uses 'retainer' while inquiry reply-plan sets booking_terms:none for this availability turn — defer to verified playbook or omit.",
    );
  }
  if (/\bdeposit\b/i.test(t)) {
    v.push(
      "email_draft uses 'deposit' while inquiry reply-plan sets booking_terms:none for this availability turn — omit booking/deposit language.",
    );
  }
  if (/\bbooking\s+fee\b/i.test(t)) {
    v.push("email_draft mentions booking fee while booking_terms:none — omit.");
  }
  if (/\bmilestone\s+payments?\b|\bpayment\s+milestones?\b|\binstallments?\b/i.test(t)) {
    v.push("email_draft mentions milestone/installment payment language while booking_terms:none — omit.");
  }
  if (/\b(?:sign|signing|signed)\s+(?:the\s+)?contract\b|\bcontract\s+(?:to\s+)?(?:sign|hold)\b/i.test(t)) {
    v.push("email_draft describes contract signing sequence while booking_terms:none — omit.");
  }
  if (/\b\d{1,2}\s*%/.test(t) || /\b100\s*%/.test(t)) {
    v.push(
      "email_draft contains a percentage figure while booking_terms:none — omit numeric % (invented commercial numbers).",
    );
  }
  if (/\binvoice\b/i.test(t)) {
    v.push(
      "email_draft uses 'invoice' while booking_terms:none — omit payment/invoice mechanics for this availability-only turn.",
    );
  }
  if (/\bpayment\s+plan\b/i.test(t)) {
    v.push("email_draft mentions payment plan while booking_terms:none — omit.");
  }
  if (/\bsecure\s+(?:your\s+)?date\b/i.test(t)) {
    v.push(
      "email_draft uses 'secure (your) date' phrasing while booking_terms:none — omit booking-mechanics language.",
    );
  }

  if (plan.cta_type === "none") {
    if (/\bconsultation\s+(?:call|with)\b.*\b(?:lead\s+)?photographer\b|\blead\s+photographer\b[^.]{0,80}\bconsultation\b/i.test(t)) {
      v.push(
        "email_draft pushes a lead-photographer consultation funnel while cta:none — keep next steps generic or omit.",
      );
    }
    if (/\bbook\s+(?:a\s+)?(?:time|slot)\b.*\b(?:below|link|calendar)\b/i.test(t)) {
      v.push("email_draft pushes calendar/booking CTAs while cta:none — omit hard funnel language.");
    }
  }

  return [...new Set(v)];
}
