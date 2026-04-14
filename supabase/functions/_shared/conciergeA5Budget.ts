/**
 * A5 — caps for `supabase/functions/inngest/functions/concierge.ts` (`gpt-4o-mini` + RAG tool loop).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

/** Client question embedded in system + user messages. */
export const CONCIERGE_MAX_CLIENT_QUESTION_CHARS = 8000;
export const CONCIERGE_MAX_ASSISTANT_MESSAGE_CHARS = 8000;
/** RAG / `searchPastCommunications` JSON or text returned to the model. */
export const CONCIERGE_MAX_TOOL_OUTPUT_CHARS = 14000;

export function truncateConciergeClientQuestion(text: string): string {
  return truncateA5ClassifierField(text, CONCIERGE_MAX_CLIENT_QUESTION_CHARS);
}

export function truncateConciergeAssistantContent(text: string | null): string | null {
  if (text === null || text === undefined) return text;
  return truncateA5ClassifierField(text, CONCIERGE_MAX_ASSISTANT_MESSAGE_CHARS);
}

export function truncateConciergeToolOutput(text: string): string {
  return truncateA5ClassifierField(text, CONCIERGE_MAX_TOOL_OUTPUT_CHARS);
}
