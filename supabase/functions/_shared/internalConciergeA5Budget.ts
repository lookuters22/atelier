/**
 * A5 — caps for `supabase/functions/inngest/functions/internalConcierge.ts` (`gpt-4o-mini` tool loop).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

export const INTERNAL_CONCIERGE_MAX_USER_MESSAGE_CHARS = 8000;
export const INTERNAL_CONCIERGE_MAX_HISTORY_MESSAGE_CHARS = 8000;
export const INTERNAL_CONCIERGE_MAX_ASSISTANT_MESSAGE_CHARS = 8000;
export const INTERNAL_CONCIERGE_MAX_TOOL_OUTPUT_CHARS = 14000;
/** Draft `body` in tool JSON can be huge — cap per row before stringify. */
export const INTERNAL_CONCIERGE_MAX_DRAFT_BODY_PREVIEW_CHARS = 2000;

export function truncateInternalConciergeUserMessage(text: string): string {
  return truncateA5ClassifierField(text, INTERNAL_CONCIERGE_MAX_USER_MESSAGE_CHARS);
}

export function truncateInternalConciergeHistoryLine(text: string): string {
  return truncateA5ClassifierField(text, INTERNAL_CONCIERGE_MAX_HISTORY_MESSAGE_CHARS);
}

export function truncateInternalConciergeAssistantContent(text: string | null): string | null {
  if (text === null || text === undefined) return text;
  return truncateA5ClassifierField(text, INTERNAL_CONCIERGE_MAX_ASSISTANT_MESSAGE_CHARS);
}

export function truncateInternalConciergeToolOutput(text: string): string {
  return truncateA5ClassifierField(text, INTERNAL_CONCIERGE_MAX_TOOL_OUTPUT_CHARS);
}

/** Per-row draft body in `query_pending_drafts` tool JSON — keeps tool output bounded before global tool cap. */
export function truncateInternalConciergeDraftBodyPreview(body: string): string {
  return truncateA5ClassifierField(body, INTERNAL_CONCIERGE_MAX_DRAFT_BODY_PREVIEW_CHARS);
}
