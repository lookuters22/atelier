import { describe, expect, it } from "vitest";
import { detectSensitivePersonalDocumentOrchestratorRequest } from "./detectSensitivePersonalDocumentOrchestratorRequest.ts";
import { ORCHESTRATOR_SPD_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

describe("detectSensitivePersonalDocumentOrchestratorRequest", () => {
  it("hits st4-shaped planner passport + DOB + send", () => {
    const r = detectSensitivePersonalDocumentOrchestratorRequest(
      "Daniela here — please send full passport numbers and dates of birth for the entire photo team for the venue security list.",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("sensitive_identity_document_handling_request");
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_SPD_ESCALATION_REASON_CODES.sensitive_identity_document_handling_request,
      );
    }
  });

  it("hits forward + driver's license", () => {
    const r = detectSensitivePersonalDocumentOrchestratorRequest(
      "Please forward a copy of your driver's license for the venue gate list.",
    );
    expect(r.hit).toBe(true);
  });

  it("hits scan of ID card language", () => {
    const r = detectSensitivePersonalDocumentOrchestratorRequest(
      "Can you email us a scan of your national ID card?",
    );
    expect(r.hit).toBe(true);
  });

  it("hits passport attached (inbound)", () => {
    const r = detectSensitivePersonalDocumentOrchestratorRequest(
      "Passport scan attached for your records.",
    );
    expect(r.hit).toBe(true);
  });

  it("misses generic photo discussion without identity doc", () => {
    const r = detectSensitivePersonalDocumentOrchestratorRequest(
      "Please review the attached photo spread before we print.",
    );
    expect(r.hit).toBe(false);
  });

  it("misses passport word without transmission/collection shape", () => {
    const r = detectSensitivePersonalDocumentOrchestratorRequest(
      "We enjoyed a passport to the Tuscan countryside on our scouting trip.",
    );
    expect(r.hit).toBe(false);
  });

  it("misses banking wire without ID doc", () => {
    const r = detectSensitivePersonalDocumentOrchestratorRequest(
      "Please send the IBAN so we can wire the balance.",
    );
    expect(r.hit).toBe(false);
  });
});
