/**
 * A5 — caps for `supabase/functions/inngest/functions/logistics.ts` (`gpt-4o-mini` + travel tool loop).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

/** `weddings.location` embedded in the system prompt. */
export const LOGISTICS_MAX_LOCATION_CHARS = 8000;
/** Client message in the user turn. */
export const LOGISTICS_MAX_CLIENT_MESSAGE_CHARS = 8000;
export const LOGISTICS_MAX_ASSISTANT_MESSAGE_CHARS = 8000;
/** `estimateTravelCosts.handler` return string in tool messages. */
export const LOGISTICS_MAX_TOOL_OUTPUT_CHARS = 14000;

export function truncateLogisticsLocation(text: string): string {
  return truncateA5ClassifierField(text, LOGISTICS_MAX_LOCATION_CHARS);
}

export function truncateLogisticsClientMessage(text: string): string {
  return truncateA5ClassifierField(text, LOGISTICS_MAX_CLIENT_MESSAGE_CHARS);
}

export function truncateLogisticsAssistantContent(text: string | null): string | null {
  if (text === null || text === undefined) return text;
  return truncateA5ClassifierField(text, LOGISTICS_MAX_ASSISTANT_MESSAGE_CHARS);
}

export function truncateLogisticsToolOutput(text: string): string {
  return truncateA5ClassifierField(text, LOGISTICS_MAX_TOOL_OUTPUT_CHARS);
}
