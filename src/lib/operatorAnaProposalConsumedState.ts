import type {
  OperatorAssistantProposedActionAuthorizedCaseException,
  OperatorAssistantProposedActionInvoiceSetupChangeProposal,
  OperatorAssistantProposedActionMemoryNote,
  OperatorAssistantProposedActionOfferBuilderChangeProposal,
  OperatorAssistantProposedActionPlaybookRuleCandidate,
  OperatorAssistantProposedActionStudioProfileChangeProposal,
  OperatorAssistantProposedActionTask,
} from "../types/operatorAssistantProposedAction.types.ts";

/** Stable id for widget proposal cards + consumed tracking (per assistant message). */
export function ruleProposalKey(p: OperatorAssistantProposedActionPlaybookRuleCandidate): string {
  return `rule:${p.proposedActionKey}:${p.topic}`;
}

export function taskProposalKey(p: OperatorAssistantProposedActionTask): string {
  return `task:${p.title}:${p.dueDate}:${p.weddingId ?? ""}`;
}

export function memoryProposalKey(p: OperatorAssistantProposedActionMemoryNote): string {
  return `memory:${p.memoryScope}:${p.title}:${p.weddingId ?? ""}:${p.personId ?? ""}`;
}

export function caseExceptionProposalKey(p: OperatorAssistantProposedActionAuthorizedCaseException): string {
  return `case_exc:${p.weddingId}:${p.overridesActionKey}:${p.clientThreadId ?? ""}`;
}

export function studioProfileChangeProposalKey(p: OperatorAssistantProposedActionStudioProfileChangeProposal): string {
  return `studio_prof:${p.rationale.slice(0, 120)}:${JSON.stringify(p.settings_patch ?? {})}:${JSON.stringify(p.studio_business_profile_patch ?? {})}`;
}

export function offerBuilderChangeProposalKey(p: OperatorAssistantProposedActionOfferBuilderChangeProposal): string {
  return `offer_bldr:${p.project_id}:${JSON.stringify(p.metadata_patch)}`;
}

export function invoiceSetupChangeProposalKey(p: OperatorAssistantProposedActionInvoiceSetupChangeProposal): string {
  return `inv_setup:${p.rationale.slice(0, 80)}:${JSON.stringify(p.template_patch)}`;
}

/**
 * Immutable update: mark one proposal key as consumed for a given assistant message.
 */
export function addConsumedProposalKey(
  prev: Record<string, string[]>,
  messageId: string,
  key: string,
): Record<string, string[]> {
  const cur = prev[messageId] ?? [];
  if (cur.includes(key)) return prev;
  return { ...prev, [messageId]: [...cur, key] };
}

export function isProposalKeyConsumed(
  prev: Record<string, string[]>,
  messageId: string,
  key: string,
): boolean {
  return (prev[messageId] ?? []).includes(key);
}
