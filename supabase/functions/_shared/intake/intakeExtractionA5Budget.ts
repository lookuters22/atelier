/**
 * A5 — caps for `supabase/functions/_shared/intake/intakeExtraction.ts` (`gpt-4o-mini` + calendar tool loop).
 */
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";

/** Raw inquiry in the user turn. */
export const INTAKE_EXTRACTION_MAX_USER_MESSAGE_CHARS = 8000;
export const INTAKE_EXTRACTION_MAX_ASSISTANT_MESSAGE_CHARS = 8000;
/** `checkCalendarAvailability.handler` return string in tool messages. */
export const INTAKE_EXTRACTION_MAX_TOOL_OUTPUT_CHARS = 14000;

export function truncateIntakeExtractionUserMessage(text: string): string {
  return truncateA5ClassifierField(text, INTAKE_EXTRACTION_MAX_USER_MESSAGE_CHARS);
}

export function truncateIntakeExtractionAssistantContent(text: string | null): string | null {
  if (text === null || text === undefined) return text;
  return truncateA5ClassifierField(text, INTAKE_EXTRACTION_MAX_ASSISTANT_MESSAGE_CHARS);
}

export function truncateIntakeExtractionToolOutput(text: string): string {
  return truncateA5ClassifierField(text, INTAKE_EXTRACTION_MAX_TOOL_OUTPUT_CHARS);
}
