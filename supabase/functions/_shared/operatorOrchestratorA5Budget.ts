/**
 * A5 — explicit caps for `supabase/functions/inngest/functions/operatorOrchestrator.ts` (`gpt-4o-mini`).
 * Shared with tests; uses the same truncation marker as mini-classifiers.
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

export const OPERATOR_ORCH_ESCALATION_CLASSIFY_MAX_QUESTION_CHARS = 8000;
export const OPERATOR_ORCH_ESCALATION_CLASSIFY_MAX_REPLY_CHARS = 12000;
export const OPERATOR_ORCH_MAX_CHAT_MESSAGE_CHARS = 8000;
export const OPERATOR_ORCH_MAX_TOOL_OUTPUT_CHARS = 14000;

export function truncateOperatorOrchestratorEscalationQuestion(text: string): string {
  return truncateA5ClassifierField(text, OPERATOR_ORCH_ESCALATION_CLASSIFY_MAX_QUESTION_CHARS);
}

export function truncateOperatorOrchestratorEscalationReply(text: string): string {
  return truncateA5ClassifierField(text, OPERATOR_ORCH_ESCALATION_CLASSIFY_MAX_REPLY_CHARS);
}

export function truncateOperatorOrchestratorChatMessage(text: string): string {
  return truncateA5ClassifierField(text, OPERATOR_ORCH_MAX_CHAT_MESSAGE_CHARS);
}

export function truncateOperatorOrchestratorToolOutput(text: string): string {
  return truncateA5ClassifierField(text, OPERATOR_ORCH_MAX_TOOL_OUTPUT_CHARS);
}
