/**
 * A5 — caps for `supabase/functions/inngest/functions/whatsappOrchestrator.ts` (`gpt-4o-mini` tool loop).
 * Composes `truncateA5ClassifierField` from `a5MiniClassifierBudget.ts` (same marker as operator orchestrator).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

/** Inbound WhatsApp text → user role message. */
export const WHATSAPP_ORCH_MAX_USER_MESSAGE_CHARS = 8000;
/** `JSON.stringify(sanitizeAgentContextForOrchestratorPrompt(ctx))` can grow with lists — cap the string. */
export const WHATSAPP_ORCH_MAX_SANITIZED_CONTEXT_JSON_CHARS = 16000;
/** Assistant natural-language turns between tool rounds. */
export const WHATSAPP_ORCH_MAX_ASSISTANT_MESSAGE_CHARS = 8000;
/** Tool JSON from calendar/CRM/travel dispatch. */
export const WHATSAPP_ORCH_MAX_TOOL_OUTPUT_CHARS = 14000;

export function truncateWhatsappOrchestratorUserMessage(text: string): string {
  return truncateA5ClassifierField(text, WHATSAPP_ORCH_MAX_USER_MESSAGE_CHARS);
}

/** Truncate serialized sanitized context; may yield non-parseable JSON at the cut — acceptable as opaque prompt text. */
export function truncateWhatsappOrchestratorSanitizedContextJson(jsonText: string): string {
  return truncateA5ClassifierField(jsonText, WHATSAPP_ORCH_MAX_SANITIZED_CONTEXT_JSON_CHARS);
}

export function truncateWhatsappOrchestratorAssistantContent(text: string | null): string | null {
  if (text === null || text === undefined) return text;
  return truncateA5ClassifierField(text, WHATSAPP_ORCH_MAX_ASSISTANT_MESSAGE_CHARS);
}

export function truncateWhatsappOrchestratorToolOutput(text: string): string {
  return truncateA5ClassifierField(text, WHATSAPP_ORCH_MAX_TOOL_OUTPUT_CHARS);
}
