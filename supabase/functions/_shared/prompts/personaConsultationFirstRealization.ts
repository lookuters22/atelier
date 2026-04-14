/**
 * Voice-only realization hints for **consultation_first + call** inquiry turns.
 * Appended to the orchestrator user message when the inquiry reply-plan matches; does not change grounding or auditors.
 */

/** Must match the heading line in {@link buildConsultationFirstInquiryUserHintBlock}. */
export const PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER =
  "=== Consultation-first inquiry — realization (voice) ===";

/** Stable substring for tests — anti-funnel instruction body. */
export const PERSONA_CONSULTATION_FIRST_ANTI_FUNNEL_BOILERPLATE_SUBSTRING =
  "Avoid stacking stock funnel lines";

/**
 * User-message addendum for structured persona drafting (orchestrator rewrite path).
 * Triggered only when facts include `INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER` from deriveInquiryReplyPlan.
 */
export function buildConsultationFirstInquiryUserHintBlock(): string {
  return [
    "",
    PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER,
    "**Avoid stacking stock funnel lines** (consultation-first inquiry, CTA = call): do not default to a script that chains \"lead photographer\", \"brief consultation call\", \"book a time using the link below\", \"customized proposal\" / \"customized offer\", and \"if you have any questions in the meantime\".",
    "- **Keep** one restrained hospitality opener (per global rules), then **at most one or two short sentences** for the call/Calendar next step—sound like a senior client manager, not a SaaS booking funnel.",
    "- **Wording:** prefer natural alternatives to formulaic \"lead photographer\" (e.g. who you'd work with, our photographer, the team member who handles planning) unless CRM/playbook gives an exact title.",
    "- **Offers:** do not promise a \"customized proposal\" unless verified policy/CRM makes that concrete; otherwise hedge with neutral next-step language.",
    "- **Closing:** skip stock \"in the meantime\" padding; end cleanly with Ana when appropriate.",
  ].join("\n");
}
