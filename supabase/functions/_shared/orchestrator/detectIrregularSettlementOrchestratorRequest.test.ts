import { describe, expect, it } from "vitest";
import { detectIrregularSettlementOrchestratorRequest } from "./detectIrregularSettlementOrchestratorRequest.ts";
import { ORCHESTRATOR_ISR_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

describe("detectIrregularSettlementOrchestratorRequest", () => {
  it("hits cash + VAT avoidance (stress test 3 shaped)", () => {
    const r = detectIrregularSettlementOrchestratorRequest(
      "Could we receive the €4,200 agency commission in cash on the wedding day to avoid the VAT charge?",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("settlement_or_tax_avoidance_request");
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_ISR_ESCALATION_REASON_CODES.settlement_or_tax_avoidance_request,
      );
    }
  });

  it("hits off the books", () => {
    expect(detectIrregularSettlementOrchestratorRequest("Can we handle this off the books?").hit).toBe(
      true,
    );
  });

  it("hits invoice differently + hide VAT", () => {
    expect(
      detectIrregularSettlementOrchestratorRequest(
        "Can you invoice this differently so we don't show VAT on the paperwork?",
      ).hit,
    ).toBe(true);
  });

  it("hits pay privately", () => {
    expect(
      detectIrregularSettlementOrchestratorRequest("Can we pay privately for the extra hour?").hit,
    ).toBe(true);
  });

  it("hits payment outside the invoice", () => {
    expect(
      detectIrregularSettlementOrchestratorRequest(
        "Let's keep the tip outside the invoice as a separate transfer.",
      ).hit,
    ).toBe(true);
  });

  it("does not hit ordinary VAT mention on invoice", () => {
    expect(
      detectIrregularSettlementOrchestratorRequest(
        "Please add our VAT number to the invoice header.",
      ).hit,
    ).toBe(false);
  });

  it("does not hit pay off the invoice (idiom)", () => {
    expect(
      detectIrregularSettlementOrchestratorRequest("We will pay off the invoice next week.").hit,
    ).toBe(false);
  });

  it("does not hit VAT included (neutral)", () => {
    expect(
      detectIrregularSettlementOrchestratorRequest("Confirm the quote is VAT inclusive.").hit,
    ).toBe(false);
  });

  it("does not hit ordinary bank transfer ask", () => {
    expect(
      detectIrregularSettlementOrchestratorRequest(
        "Can you send your IBAN so we can pay by bank transfer?",
      ).hit,
    ).toBe(false);
  });

  it("uses threadContextSnippet when message alone is thin", () => {
    const r = detectIrregularSettlementOrchestratorRequest("Thanks!", "Cash on day one to avoid VAT.");
    expect(r.hit).toBe(true);
  });
});
