/**
 * Deterministic banking / compliance exception detection for orchestrator proposals.
 * Runs before non-commercial risk. Geography for payment-rail requires transfer/payment-block language.
 */
import type { OrchestratorBankingComplianceClass } from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_BC_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

export const BANKING_COMPLIANCE_MAX_COMBINED_CHARS = 8000;

export const BANKING_COMPLIANCE_EXCEPTION_BLOCKER = "banking_compliance_exception" as const;

/** Shared normalization for BC detection and compliance-asset library hints (same bounded window). */
export function normalizeBankingComplianceCombinedText(
  rawMessage: string,
  threadContextSnippet: string | undefined,
): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > BANKING_COMPLIANCE_MAX_COMBINED_CHARS
    ? collapsed.slice(-BANKING_COMPLIANCE_MAX_COMBINED_CHARS)
    : collapsed;
}

export type BankingComplianceDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorBankingComplianceClass;
      escalation_reason_code:
        (typeof ORCHESTRATOR_BC_ESCALATION_REASON_CODES)[OrchestratorBankingComplianceClass];
    };

/**
 * Transfer / bank failure language — not bare country names.
 */
function hasPaymentTransferExceptionContext(text: string): boolean {
  return (
    /\b(?:my\s+)?bank\s+will\s+not\s+(?:transfer|send|wire)\b/.test(text) ||
    /\b(?:cannot|can't|can not|will not|won't|unable to)\s+transfer\b/.test(text) ||
    /\b(?:cannot|can't|will not|unable to)\s+send\s+(?:a\s+)?(?:wire|transfer|payment)\b/.test(text) ||
    /\b(?:cannot|can't|will not|unable to)\s+transfer\s+to\b/.test(text)
  );
}

/**
 * Geography only counts with transfer exception phrasing (e.g. "transfer to serbia"), not "serbia" alone.
 */
function hasTransferToGeography(text: string): boolean {
  return /\b(?:transfer|wire|send)\s+to\s+[a-z][a-z\s]{1,48}\b/.test(text);
}

function hasAlternateRailOrAccountRequest(text: string): boolean {
  return (
    /\b(?:us\s+dollar|usd)\s+account\b/.test(text) ||
    /\buk\s+account\b/.test(text) ||
    /\b(?:a\s+)?different\s+(?:bank\s+)?account\b/.test(text) ||
    /\b(?:send|give|use|provide)\s+(?:(?:a|an|the)\s+)?(?:iban|swift)\b/.test(text) ||
    /\baccount\s+instead\b/.test(text)
  );
}

function matchesPaymentRailException(text: string): boolean {
  if (!hasPaymentTransferExceptionContext(text)) return false;
  return hasTransferToGeography(text) || hasAlternateRailOrAccountRequest(text);
}

/** NDA / signatures / insurance certs — conservative; not bare "insurance". */
function matchesComplianceDocumentRequest(text: string): boolean {
  if (
    /\bnda\b/.test(text) ||
    /\bnon[- ]disclosure\b/.test(text) ||
    (/\bdocusign\b/.test(text) && /\b(sign|nda|agreement|contract)\b/.test(text))
  ) {
    return true;
  }
  if (
    /\binsurance certificate\b/.test(text) ||
    /\bpublic liability\b/.test(text) ||
    /\bcertificate of insurance\b/.test(text) ||
    /\bcoi\b/.test(text) ||
    /\bliability insurance\b/.test(text) ||
    /\bpl insurance\b/.test(text) ||
    /\b(?:£|\$|€)\s*[\d,.]+[km]?\s*(?:public\s+)?liability\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

export function detectBankingComplianceOrchestratorException(
  rawMessage: string,
  threadContextSnippet?: string,
): BankingComplianceDetection {
  const text = normalizeBankingComplianceCombinedText(rawMessage, threadContextSnippet);

  if (matchesPaymentRailException(text)) {
    return {
      hit: true,
      primaryClass: "payment_rail_exception",
      escalation_reason_code: ORCHESTRATOR_BC_ESCALATION_REASON_CODES.payment_rail_exception,
    };
  }
  if (matchesComplianceDocumentRequest(text)) {
    return {
      hit: true,
      primaryClass: "compliance_document_request",
      escalation_reason_code: ORCHESTRATOR_BC_ESCALATION_REASON_CODES.compliance_document_request,
    };
  }
  return { hit: false };
}
