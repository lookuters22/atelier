/**
 * Phase 4.1 — bounded deterministic non-commercial risk detection for orchestrator proposals.
 * Combined message + optional thread snippet; priority: legal_compliance > pr_vendor_dispute >
 * artistic_dispute.
 *
 * **legal_compliance:** Plain `insurance` alone is NOT sufficient (too many benign cases). Require
 * strong legal tokens and/or phrases: claim, NDA, liability (in compliance sense), breach, certificate
 * with insurance, lawyer, court, etc.
 *
 * Visual / mockup / proof verification is handled by `detectVisualAssetVerificationOrchestratorRequest` (not NC).
 */
import {
  type OrchestratorNonCommercialRiskClass,
  ORCHESTRATOR_NC_ESCALATION_REASON_CODES,
} from "../../../../src/types/decisionContext.types.ts";

const MAX_COMBINED_CHARS = 8000;

export type NonCommercialRiskDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorNonCommercialRiskClass;
      escalation_reason_code: (typeof ORCHESTRATOR_NC_ESCALATION_REASON_CODES)[OrchestratorNonCommercialRiskClass];
    };

function normalizeCombinedText(rawMessage: string, threadContextSnippet: string | undefined): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

/** Legal / compliance: avoid bare "insurance" — require compounds or strong legal tokens. */
function matchesLegalCompliance(text: string): boolean {
  if (
    /\b(lawyer|attorney|sue|suing|lawsuit|litigation|subpoena)\b/.test(text) ||
    /\bnda\b/.test(text) ||
    /\bnon[- ]disclosure\b/.test(text) ||
    /\b(breach of contract|contract breach)\b/.test(text) ||
    /\bbreach\b/.test(text) && /\b(contract|agreement|terms)\b/.test(text) ||
    /\bcourt\b/.test(text) ||
    /\b(legal notice|legal counsel|legal advice)\b/.test(text) ||
    /\blegal\b/.test(text)
  ) {
    return true;
  }
  if (/\bdocusign\b/.test(text) && /\b(sign|nda|agreement|contract)\b/.test(text)) {
    return true;
  }
  // Insurance only in compliance-heavy phrases (not standalone "insurance").
  if (
    /\binsurance claim\b/.test(text) ||
    /\bpublic liability\b/.test(text) ||
    /\bprofessional indemnity\b/.test(text) ||
    /\bliability insurance\b/.test(text) ||
    /\binsurance certificate\b/.test(text) ||
    /\bpl insurance\b/.test(text) ||
    /\b(?:£|\$|€)\s*[\d,.]+[km]?\s*(?:public\s+)?liability\b/i.test(text) ||
    /\bliability\s+certificate\b/.test(text)
  ) {
    return true;
  }
  return false;
}

function matchesArtisticDispute(text: string): boolean {
  return (
    /\b(ruined|disappointed|unprofessional)\b/.test(text) ||
    /\b(terrible editing|terrible photos|hate these|hate the photos|hate these photos)\b/.test(text) ||
    /\b(fake colors|colors look fake|looks fake)\b/.test(text) ||
    /\bweird crops\b/.test(text) ||
    /\b(editing was|photo editing)\b/.test(text) && /\b(terrible|awful|bad)\b/.test(text)
  );
}

function matchesPrVendorDispute(text: string): boolean {
  return (
    /\b(missing credits?|missing credit)\b/.test(text) ||
    /\bunauthorized publication\b/.test(text) ||
    /\b(social media|press release)\b/.test(text) ||
    /\b(angry vendor|angry vendors)\b/.test(text) ||
    /\bpublished without (permission|consent|approval)\b/.test(text) ||
    /\b(wedluxe|wed luxe)\b/.test(text) ||
    (/\bfurious\b/.test(text) && /\b(vendor|florist|published|magazine)\b/.test(text)) ||
    (/\bangry\b/.test(text) && /\b(vendor|published|credit|wedluxe)\b/.test(text)) ||
    (/\bpublication\b/.test(text) && /\b(permission|credit|unauthorized)\b/.test(text))
  );
}

/**
 * Deterministic scan of inbound + optional thread context (bounded length).
 */
export function detectNonCommercialOrchestratorRisk(
  rawMessage: string,
  threadContextSnippet?: string,
): NonCommercialRiskDetection {
  const text = normalizeCombinedText(rawMessage, threadContextSnippet);

  if (matchesLegalCompliance(text)) {
    return {
      hit: true,
      primaryClass: "legal_compliance",
      escalation_reason_code: ORCHESTRATOR_NC_ESCALATION_REASON_CODES.legal_compliance,
    };
  }
  if (matchesPrVendorDispute(text)) {
    return {
      hit: true,
      primaryClass: "pr_vendor_dispute",
      escalation_reason_code: ORCHESTRATOR_NC_ESCALATION_REASON_CODES.pr_vendor_dispute,
    };
  }
  if (matchesArtisticDispute(text)) {
    return {
      hit: true,
      primaryClass: "artistic_dispute",
      escalation_reason_code: ORCHESTRATOR_NC_ESCALATION_REASON_CODES.artistic_dispute,
    };
  }

  return { hit: false };
}
