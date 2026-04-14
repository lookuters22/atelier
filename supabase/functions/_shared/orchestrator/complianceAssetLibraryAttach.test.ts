import { describe, expect, it } from "vitest";
import {
  describeComplianceAssetLibraryKey,
  resolveComplianceAssetLibraryKey,
} from "./complianceAssetLibraryAttach.ts";

describe("complianceAssetLibraryAttach", () => {
  it("resolves public_liability_coi for COI / certificate language without NDA", () => {
    expect(resolveComplianceAssetLibraryKey("Please send your certificate of insurance before the wedding.")).toBe(
      "public_liability_coi",
    );
    expect(resolveComplianceAssetLibraryKey("We need your COI on file.")).toBe("public_liability_coi");
    expect(
      resolveComplianceAssetLibraryKey("Attach your public liability certificate to this email."),
    ).toBe("public_liability_coi");
  });

  it("returns null for NDA / DocuSign + insurance (mixed workflow — generic BC only)", () => {
    expect(
      resolveComplianceAssetLibraryKey(
        "Please sign the NDA in DocuSign and send your £10m Public Liability Insurance certificate.",
      ),
    ).toBeNull();
    expect(
      resolveComplianceAssetLibraryKey("Non-disclosure first, then your liability insurance cert."),
    ).toBeNull();
  });

  it("resolves venue_security_compliance_packet when portal/upload + insurance cert align", () => {
    expect(
      resolveComplianceAssetLibraryKey(
        "Upload your £10 million public liability insurance certificate to their vendor portal before load-in.",
      ),
    ).toBe("venue_security_compliance_packet");
    expect(
      resolveComplianceAssetLibraryKey(
        "Venue security requires your COI; please use the security portal to upload before load-in.",
      ),
    ).toBe("venue_security_compliance_packet");
  });

  it("describeComplianceAssetLibraryKey returns static copy", () => {
    const d = describeComplianceAssetLibraryKey("public_liability_coi");
    expect(d.operator_label).toContain("Public liability");
    expect(d.storage_hint).toContain("public_liability_coi");
  });
});
