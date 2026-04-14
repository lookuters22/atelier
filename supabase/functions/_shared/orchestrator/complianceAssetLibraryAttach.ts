/**
 * Deterministic “compliance asset library” hints for operator attach paths.
 * Only for BC `compliance_document_request` — excludes NDA/DocuSign/signature workflows and payment-rail BC.
 */
import type { OrchestratorComplianceAssetLibraryKey } from "../../../../src/types/decisionContext.types.ts";
import { normalizeBankingComplianceCombinedText } from "./detectBankingComplianceOrchestratorException.ts";

/** Same exclusion intent as the NDA/signature arm of `matchesComplianceDocumentRequest` in the BC detector. */
function matchesNdaOrSignatureComplianceShape(text: string): boolean {
  return (
    /\bnda\b/.test(text) ||
    /\bnon[- ]disclosure\b/.test(text) ||
    (/\bdocusign\b/.test(text) && /\b(sign|nda|agreement|contract)\b/.test(text))
  );
}

function matchesAttachableInsuranceCertificate(text: string): boolean {
  return (
    /\binsurance certificate\b/.test(text) ||
    /\bpublic liability\b/.test(text) ||
    /\bcertificate of insurance\b/.test(text) ||
    /\bcoi\b/.test(text) ||
    /\bliability insurance\b/.test(text) ||
    /\bpl insurance\b/.test(text) ||
    /\b(?:£|\$|€)\s*[\d,.]+[km]?\s*(?:public\s+)?liability\b/i.test(text)
  );
}

/**
 * Venue / security / portal-shaped compliance upload (narrow): requires insurance-cert language plus portal/venue-security/load-in cues.
 */
function matchesVenueSecurityCompliancePacket(text: string): boolean {
  if (!matchesAttachableInsuranceCertificate(text)) return false;
  const portalCue =
    /\bvendor portal\b/.test(text) ||
    /\bsecurity portal\b/.test(text) ||
    (/\bportal\b/.test(text) && /\bupload\b/.test(text));
  const venueSecurityLoadIn =
    /\bvenue\b/.test(text) && /\bsecurity\b/.test(text) && /\bload[- ]in\b/.test(text);
  return portalCue || venueSecurityLoadIn;
}

const CAP_COPY: Record<
  OrchestratorComplianceAssetLibraryKey,
  { operator_label: string; storage_hint: string }
> = {
  public_liability_coi: {
    operator_label: "Public liability / certificate of insurance (COI)",
    storage_hint: "studio_compliance_assets/public_liability_coi (convention — not resolved here)",
  },
  venue_security_compliance_packet: {
    operator_label: "Venue or security portal compliance packet (e.g. COI upload)",
    storage_hint: "studio_compliance_assets/venue_security_packet (convention — not resolved here)",
  },
};

export function describeComplianceAssetLibraryKey(
  key: OrchestratorComplianceAssetLibraryKey,
): { operator_label: string; storage_hint: string } {
  return CAP_COPY[key];
}

/**
 * When BC class is `compliance_document_request`, returns a stable library key for recurring attachable artifacts.
 * Returns null for NDA/signature-shaped threads or when no attachable insurance/venue-compliance pattern matches.
 */
export function resolveComplianceAssetLibraryKey(
  rawMessage: string,
  threadContextSnippet?: string,
): OrchestratorComplianceAssetLibraryKey | null {
  const text = normalizeBankingComplianceCombinedText(rawMessage, threadContextSnippet);
  if (matchesNdaOrSignatureComplianceShape(text)) return null;
  if (matchesVenueSecurityCompliancePacket(text)) return "venue_security_compliance_packet";
  if (matchesAttachableInsuranceCertificate(text)) return "public_liability_coi";
  return null;
}
