/**
 * A5 — caps for `supabase/functions/_shared/agents/matchmaker.ts` (`gpt-4o-mini` + JSON roster).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

/** Inbound message in the "## Inbound Message" section. */
export const MATCHMAKER_MAX_INBOUND_CHARS = 8000;
/** `JSON.stringify` of the active-weddings roster block (dominant prompt growth). */
export const MATCHMAKER_MAX_ROSTER_JSON_CHARS = 24000;

export function truncateMatchmakerInboundMessage(text: string): string {
  return truncateA5ClassifierField(text, MATCHMAKER_MAX_INBOUND_CHARS);
}

export function truncateMatchmakerRosterJson(text: string): string {
  return truncateA5ClassifierField(text, MATCHMAKER_MAX_ROSTER_JSON_CHARS);
}
