/**
 * Tenant policy for first-touch inquiry CTAs — stored on `photographers.settings.inquiry_first_step_style`
 * and surfaced on {@link DecisionContext#inquiryFirstStepStyle}.
 */
export type InquiryFirstStepStyle = "proactive_call" | "soft_call" | "no_call_push";

export const INQUIRY_FIRST_STEP_STYLE_VALUES: readonly InquiryFirstStepStyle[] = [
  "proactive_call",
  "soft_call",
  "no_call_push",
] as const;

export function normalizeInquiryFirstStepStyle(raw: unknown): InquiryFirstStepStyle {
  if (raw === "soft_call" || raw === "no_call_push" || raw === "proactive_call") {
    return raw;
  }
  return "proactive_call";
}

/** Onboarding / review copy — keep in sync with Voice step selectors. */
export const INQUIRY_FIRST_STEP_STYLE_UI: Record<
  InquiryFirstStepStyle,
  { label: string; shortHint: string }
> = {
  proactive_call: {
    label: "Offer a call when it fits",
    shortHint: "Ana may suggest a consultation or call on new inquiries.",
  },
  soft_call: {
    label: "Call only as an option",
    shortHint: "Ana may mention a call lightly — not as the main push.",
  },
  no_call_push: {
    label: "Email first — no proactive call push",
    shortHint: "Ana answers helpfully without steering new inquiries to book a call unless the client asks.",
  },
};
