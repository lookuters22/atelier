import { describe, expect, it } from "vitest";
import { detectNonCommercialOrchestratorRisk } from "./detectNonCommercialOrchestratorRisk.ts";

describe("detectNonCommercialOrchestratorRisk", () => {
  it("detects artistic_dispute (stress test 1 shaped)", () => {
    const r = detectNonCommercialOrchestratorRisk(
      "The wedding day colors look fake, my hair looks yellow in the photos, and some crops feel weird.",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("artistic_dispute");
      expect(r.escalation_reason_code).toBe("NC_ARTISTIC_DISPUTE_V1");
    }
  });

  it("detects pr_vendor_dispute (stress test 8 PR crisis)", () => {
    const r = detectNonCommercialOrchestratorRisk(
      "I am so angry — WedLuxe published without permission and florists are furious about missing credits.",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("pr_vendor_dispute");
      expect(r.escalation_reason_code).toBe("NC_PR_VENDOR_DISPUTE_V1");
    }
  });

  it("detects legal_compliance (NDA + insurance certificate; not bare insurance)", () => {
    const r = detectNonCommercialOrchestratorRisk(
      "Please sign the NDA in DocuSign and send your £10m Public Liability Insurance certificate.",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("legal_compliance");
      expect(r.escalation_reason_code).toBe("NC_LEGAL_COMPLIANCE_V1");
    }
  });

  it("does not treat bare insurance as legal_compliance", () => {
    const r = detectNonCommercialOrchestratorRisk(
      "Do you recommend travel insurance for our flights to the venue?",
    );
    expect(r.hit).toBe(false);
  });

  it("detects legal_compliance from thread snippet only (combined scan)", () => {
    const r = detectNonCommercialOrchestratorRisk("Thanks!", "Please have your lawyer review the contract breach clause.");
    expect(r.hit).toBe(true);
    if (r.hit) expect(r.primaryClass).toBe("legal_compliance");
  });

  it("visual/mockup messages are not NC (handled by visual asset verification detector)", () => {
    const r = detectNonCommercialOrchestratorRisk(
      "Attached is the album cover mockup PDF — please confirm the spelling before we print.",
    );
    expect(r.hit).toBe(false);
  });

  it("does not flag benign album / photo praise (conservative visual)", () => {
    const r = detectNonCommercialOrchestratorRisk("We love the album photos you shared, they are beautiful!");
    expect(r.hit).toBe(false);
  });

  it("priority: legal beats PR when both cues present", () => {
    const r = detectNonCommercialOrchestratorRisk(
      "Our lawyer says the NDA was breached and WedLuxe also published without permission.",
    );
    expect(r.hit).toBe(true);
    if (r.hit) expect(r.primaryClass).toBe("legal_compliance");
  });

  it("benign scheduling does not hit", () => {
    const r = detectNonCommercialOrchestratorRisk(
      "Can we schedule a call next Tuesday to discuss the timeline?",
    );
    expect(r.hit).toBe(false);
  });
});
