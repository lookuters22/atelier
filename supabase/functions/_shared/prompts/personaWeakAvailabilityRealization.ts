/**
 * Voice + safety realization for **weak availability** inquiry turns (playbook does not support
 * verified booking-process language). Appended to the orchestrator user message; does not change auditors.
 */

/** Must match the heading line in {@link buildWeakAvailabilityInquiryUserHintBlock}. */
export const PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER =
  "=== Weak availability inquiry — realization (voice) ===";

/** Stable substring for tests (anti–booking-mechanics list). */
export const PERSONA_WEAK_AVAILABILITY_ANTI_MECHANICS_SUBSTRING =
  "lead-photographer consultation funnel";

/**
 * User-message addendum when facts include `INQUIRY_REPLY_WEAK_AVAILABILITY_ONLY_MARKER`.
 */
export function buildWeakAvailabilityInquiryUserHintBlock(): string {
  return [
    "",
    PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER,
    "**Scope:** The client asked about **date availability**. Verified playbook on this tenant does **not** support booking-process specifics — stay in a **narrow safe corridor**: hospitality + plain availability stance + at most **one** light generic next step.",
    "**Write (allowed):**",
    "- Brief warm acknowledgement.",
    "- Clear availability answer aligned with Authoritative CRM / inbound (yes / checking / soft hedge if CRM is silent — do not invent holds).",
    "- At most **one** short sentence for a generic next step (e.g. happy to share more once you want to move forward; reply with questions) **without** scheduling links, deposits, or product promises.",
    "**Do not write (forbidden drift):** retainer, deposit, invoice, milestone, installment, balance due, secure your date, signed contract, any **numeric %**, payment plan, booking fee, “book a time / slot / calendar link below”, lead-photographer consultation funnel, customized proposal/offer promises.",
    "**Tone:** Senior client manager — warm, not a SaaS booking funnel.",
    "**committed_terms (mandatory shape for this turn):** `package_names`: [] unless a name is explicitly in Authoritative CRM or verbatim in Verified policy lines; `deposit_percentage`: null; `travel_miles_included`: null — this reply must not commit to commercial numbers.",
  ].join("\n");
}
