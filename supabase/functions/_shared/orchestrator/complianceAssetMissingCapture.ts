/**
 * When compliance library files are missing in Storage, surface an explicit operator path:
 * deterministic WhatsApp request copy for the photographer and upload target via
 * `uploadComplianceAssetToLibrary` — no automated WhatsApp transport or generic upload UI.
 */
import type { OrchestratorComplianceAssetLibraryKey, OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";

/** Set when `compliance_asset_resolution.found === false` after Storage check (collect before attach). */
export const V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY =
  "v3_compliance_asset_library_missing_collect" as const;

const PHOTOGRAPHER_WHATSAPP_REQUEST: Record<OrchestratorComplianceAssetLibraryKey, string> = {
  public_liability_coi:
    "Please send your current public liability / certificate of insurance (PDF or clear photo of the certificate). We will store it under your studio compliance library for venue and client requests.",
  venue_security_compliance_packet:
    "Please send the venue/security compliance document or COI PDF we should keep on file for portal uploads (PDF preferred). We will store it under your studio compliance library path.",
};

/**
 * Deterministic operator-facing copy for asking the photographer on WhatsApp (paste or adapt).
 */
export function buildPhotographerWhatsAppComplianceRequestCopy(
  libraryKey: OrchestratorComplianceAssetLibraryKey,
): string {
  return PHOTOGRAPHER_WHATSAPP_REQUEST[libraryKey];
}

const MISSING_OPERATOR_SUFFIX =
  " Storage check: standard compliance file is not present yet (found=false). Operator: contact photographer on WhatsApp using the deterministic request copy; after receipt, upload to the canonical bucket/path (see compliance_asset_resolution).";

/**
 * After `enrichProposalsWithComplianceAssetResolution`, remap the operator routing row when the
 * library file is missing. Adds a blocker on the blocked `send_message` row when the same asset is missing.
 */
export function applyMissingComplianceAssetOperatorProposals(
  proposals: OrchestratorProposalCandidate[],
): OrchestratorProposalCandidate[] {
  return proposals.map((p) => {
    const res = p.compliance_asset_resolution;
    const missing = res && res.found === false;

    if (
      p.action_key === "v3_compliance_asset_library_attach" &&
      missing
    ) {
      const key = p.compliance_asset_library_key ?? res!.library_key;
      const whatsapp = buildPhotographerWhatsAppComplianceRequestCopy(key);
      return {
        ...p,
        action_key: V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY,
        rationale: `${p.rationale}${MISSING_OPERATOR_SUFFIX} WhatsApp request (photographer): ${whatsapp}`,
        blockers_or_missing_facts: [
          ...p.blockers_or_missing_facts,
          "compliance_asset_missing_request_whatsapp_capture_v3",
        ],
      };
    }

    if (
      p.action_family === "send_message" &&
      p.action_key === "send_message" &&
      missing &&
      p.compliance_asset_library_key !== undefined
    ) {
      return {
        ...p,
        blockers_or_missing_facts: [
          ...p.blockers_or_missing_facts,
          "compliance_asset_missing_in_storage_v3",
        ],
      };
    }

    return p;
  });
}
