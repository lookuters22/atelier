import { describe, expect, it } from "vitest";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import {
  applyMissingComplianceAssetOperatorProposals,
  buildPhotographerWhatsAppComplianceRequestCopy,
  V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY,
} from "./complianceAssetMissingCapture.ts";

const baseOp = (overrides: Partial<OrchestratorProposalCandidate>): OrchestratorProposalCandidate => ({
  id: "c1",
  action_family: "operator_notification_routing",
  action_key: "v3_compliance_asset_library_attach",
  rationale: "base ",
  verifier_gating_required: true,
  likely_outcome: "draft",
  blockers_or_missing_facts: [],
  ...overrides,
});

describe("complianceAssetMissingCapture", () => {
  it("buildPhotographerWhatsAppComplianceRequestCopy is deterministic per key", () => {
    const a = buildPhotographerWhatsAppComplianceRequestCopy("public_liability_coi");
    const b = buildPhotographerWhatsAppComplianceRequestCopy("public_liability_coi");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(20);
    expect(buildPhotographerWhatsAppComplianceRequestCopy("venue_security_compliance_packet")).toContain("venue");
  });

  it("remaps operator attach to missing_collect when found is false", () => {
    const proposals = applyMissingComplianceAssetOperatorProposals([
      baseOp({
        compliance_asset_library_key: "public_liability_coi",
        compliance_asset_resolution: {
          library_key: "public_liability_coi",
          storage_bucket: "compliance_asset_library",
          object_path: "u/x.pdf",
          found: false,
        },
      }),
    ]);
    expect(proposals[0]?.action_key).toBe(V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY);
    expect(proposals[0]?.rationale).toContain("WhatsApp request (photographer):");
    expect(proposals[0]?.blockers_or_missing_facts).toContain(
      "compliance_asset_missing_request_whatsapp_capture_v3",
    );
  });

  it("leaves attach when found is true", () => {
    const proposals = applyMissingComplianceAssetOperatorProposals([
      baseOp({
        compliance_asset_resolution: {
          library_key: "public_liability_coi",
          storage_bucket: "compliance_asset_library",
          object_path: "u/x.pdf",
          found: true,
        },
      }),
    ]);
    expect(proposals[0]?.action_key).toBe("v3_compliance_asset_library_attach");
  });

  it("adds blocker on blocked send_message when asset missing", () => {
    const proposals = applyMissingComplianceAssetOperatorProposals([
      baseOp({
        compliance_asset_library_key: "public_liability_coi",
        compliance_asset_resolution: {
          library_key: "public_liability_coi",
          storage_bucket: "b",
          object_path: "p",
          found: false,
        },
      }),
      {
        id: "s1",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "blocked",
        verifier_gating_required: true,
        likely_outcome: "block",
        blockers_or_missing_facts: ["banking_compliance_exception"],
        compliance_asset_library_key: "public_liability_coi",
        compliance_asset_resolution: {
          library_key: "public_liability_coi",
          storage_bucket: "b",
          object_path: "p",
          found: false,
        },
      },
    ]);
    expect(proposals[1]?.blockers_or_missing_facts).toContain("compliance_asset_missing_in_storage_v3");
  });
});
