/**
 * A5 — caps for `supabase/functions/inngest/functions/projectManager.ts`.
 * (No LLM in this worker; budgets bound response metadata and task title text.)
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

/** Matches prior `raw_message.slice(0, 120)` intent for `triggered_by` return field. */
export const PROJECT_MANAGER_MAX_TRIGGERED_BY_CHARS = 120;
/** `weddings.couple_names` embedded in dashboard task title. */
export const PROJECT_MANAGER_MAX_COUPLE_NAMES_FOR_TITLE_CHARS = 2000;

export function truncateProjectManagerTriggeredBy(text: string): string {
  return truncateA5ClassifierField(text, PROJECT_MANAGER_MAX_TRIGGERED_BY_CHARS);
}

export function truncateProjectManagerCoupleNamesForTitle(text: string): string {
  return truncateA5ClassifierField(text, PROJECT_MANAGER_MAX_COUPLE_NAMES_FOR_TITLE_CHARS);
}
