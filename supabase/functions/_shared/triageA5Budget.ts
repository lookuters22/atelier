/**
 * A5 — caps for `supabase/functions/_shared/agents/triage.ts` (`gpt-4o-mini` intent classifier).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

/** User message in the single classification turn. */
export const TRIAGE_MAX_USER_MESSAGE_CHARS = 8000;

export function truncateTriageUserMessage(text: string): string {
  return truncateA5ClassifierField(text, TRIAGE_MAX_USER_MESSAGE_CHARS);
}
