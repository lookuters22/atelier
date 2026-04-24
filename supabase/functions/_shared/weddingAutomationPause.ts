/**
 * Life-event pause (v1): when either flag is true, automated client-facing workflows
 * must not create drafts, send drip messages, or advance automation — operator-confirmed paths stay separate.
 */
export type WeddingAutomationPauseInput = {
  compassion_pause?: boolean | null;
  strategic_pause?: boolean | null;
};

/** Stable skip_reason / log token for compassion + strategic pause (grep-friendly in Inngest / Edge logs). */
export const WEDDING_AUTOMATION_PAUSED_SKIP_REASON = "wedding_automation_paused" as const;

/** Distinct from life-event pause — workflows that already gated on `agency_cc_lock` keep explicit labeling. */
export const AGENCY_CC_LOCK_SKIP_REASON = "agency_cc_lock" as const;

export function isWeddingAutomationPaused(
  wedding: WeddingAutomationPauseInput | null | undefined,
): boolean {
  if (!wedding) return false;
  return wedding.compassion_pause === true || wedding.strategic_pause === true;
}

/**
 * Single-line JSON for Edge / Inngest function logs — search `skip_reason` + `wedding_automation_paused`.
 * Does not persist; no analytics tables.
 */
export function logAutomationPauseObservation(payload: {
  observation_type: string;
  skip_reason: string;
  inngest_function_id?: string;
  wedding_id?: string | null;
  thread_id?: string | null;
  photographer_id?: string | null;
  [key: string]: unknown;
}): void {
  console.log(JSON.stringify(payload));
}
