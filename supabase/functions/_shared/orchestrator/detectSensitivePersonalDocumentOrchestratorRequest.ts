/**
 * Deterministic **routing / safety** gate for **government identity documents** and tightly related
 * sensitive identity data in thread text (passport, national ID, driver's license, scans/copies,
 * send/forward/attach language).
 *
 * **Not** DLP, not file inspection, not storage policy — text-shaped detection for orchestrator proposals only.
 * **Distinct** from {@link detectVisualAssetVerificationOrchestratorRequest} (layout/proof),
 * {@link detectBankingComplianceOrchestratorException}, {@link detectIrregularSettlementOrchestratorRequest},
 * and {@link detectIdentityEntityRoutingAmbiguity} (B2B/entity ambiguity).
 */
import type { OrchestratorSensitivePersonalDocumentClass } from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_SPD_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

const MAX_COMBINED_CHARS = 8000;

export const SENSITIVE_PERSONAL_DOCUMENT_BLOCKER = "sensitive_personal_document" as const;

export type SensitivePersonalDocumentDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorSensitivePersonalDocumentClass;
      escalation_reason_code: (typeof ORCHESTRATOR_SPD_ESCALATION_REASON_CODES)[OrchestratorSensitivePersonalDocumentClass];
    };

function normalizeCombinedText(rawMessage: string, threadContextSnippet: string | undefined): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

/** Passport, national ID, driver's license, and explicit identity-document phrases only. */
function hasGovernmentIdentityDocCue(text: string): boolean {
  return (
    /\bpassports?\b/.test(text) ||
    /\bpassport\s+numbers?\b/.test(text) ||
    /\b(?:national\s+)?id\s+cards?\b/.test(text) ||
    /\bidentity\s+(?:cards?|documents?)\b/.test(text) ||
    /\bidentification\s+documents?\b/.test(text) ||
    /\bgovernment(?:[-\s]issued)?\s+ids?\b/.test(text) ||
    /\bphoto\s+ids?\b/.test(text) ||
    /\bdrivers?\s+licen[cs]es?\b/.test(text) ||
    /\bdriver'?s?\s+licen[cs]e\b/.test(text) ||
    /\bdriving\s+licen[cs]es?\b/.test(text)
  );
}

/**
 * Require identity-doc cue plus an explicit collection/transmission/shape cue so generic mentions
 * ("passport" as metaphor, static policy text) do not fire.
 */
function matchesSensitiveIdentityHandlingShape(text: string): boolean {
  if (!hasGovernmentIdentityDocCue(text)) return false;

  const asksTransmission =
    /\b(?:please\s+)?(?:send|forward|attach|upload|provide|supply|email|share)\b/.test(text) ||
    /\b(?:send|forward|attach)\s+(?:us|me|the|your|a|an|full|over)\b/.test(text);

  const scanOrCopyOfId =
    /\b(?:scan|scanned|scans|photo|photograph|photocopy|copy|picture|image)s?\b[\s\S]{0,100}\b(?:of|of\s+the|of\s+my|of\s+your)\b[\s\S]{0,100}\b(?:passport|id\s+card|licen[cs]e|identity\s+card|drivers?\s+licen[cs]e|driver'?s?\s+licen[cs]e)\b/.test(
      text,
    ) ||
    /\b(?:passport|id\s+card|licen[cs]e|identity\s+card|drivers?\s+licen[cs]e|driver'?s?\s+licen[cs]e)\b[\s\S]{0,100}\b(?:scan|scanned|photo|photograph|copy|attachment|attached|enclosed|uploaded)\b/.test(
      text,
    );

  /** Venue/security list + DOB only when an ID anchor is present (narrow conjunction). */
  const dobWithIdListContext =
    /\bdates?\s+of\s+birth\b/.test(text) &&
    /\b(?:passport|national\s+id|id\s+card|government|security\s+list|venue\s+security|access\s+list)\b/.test(text);

  return asksTransmission || scanOrCopyOfId || dobWithIdListContext;
}

export function detectSensitivePersonalDocumentOrchestratorRequest(
  rawMessage: string,
  threadContextSnippet?: string,
): SensitivePersonalDocumentDetection {
  const text = normalizeCombinedText(rawMessage, threadContextSnippet);
  if (!matchesSensitiveIdentityHandlingShape(text)) return { hit: false };
  return {
    hit: true,
    primaryClass: "sensitive_identity_document_handling_request",
    escalation_reason_code:
      ORCHESTRATOR_SPD_ESCALATION_REASON_CODES.sensitive_identity_document_handling_request,
  };
}
