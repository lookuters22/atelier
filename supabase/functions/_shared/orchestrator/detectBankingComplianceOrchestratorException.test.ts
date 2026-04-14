import { describe, expect, it } from "vitest";
import {
  BANKING_COMPLIANCE_EXCEPTION_BLOCKER,
  detectBankingComplianceOrchestratorException,
} from "./detectBankingComplianceOrchestratorException.ts";
import { ORCHESTRATOR_BC_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

const ST2_BANKING =
  "My bank will not transfer to Serbia. Can you send a US dollar account instead? Or UK?";

const ST8_NDA_INSURANCE =
  "Please sign the NDA in DocuSign and send your £10m Public Liability Insurance certificate.";

describe("detectBankingComplianceOrchestratorException", () => {
  it("st2 banking: payment_rail_exception", () => {
    const d = detectBankingComplianceOrchestratorException(ST2_BANKING);
    expect(d.hit).toBe(true);
    if (d.hit) {
      expect(d.primaryClass).toBe("payment_rail_exception");
      expect(d.escalation_reason_code).toBe(ORCHESTRATOR_BC_ESCALATION_REASON_CODES.payment_rail_exception);
    }
  });

  it("st8 RSD re-issue: payment_rail_exception when cannot send wire + provide the IBAN", () => {
    const d = detectBankingComplianceOrchestratorException(
      "Our bank cannot send a wire in euros — please re-issue the invoice in RSD and provide the IBAN for Belgrade settlement.",
    );
    expect(d.hit).toBe(true);
    if (d.hit) {
      expect(d.primaryClass).toBe("payment_rail_exception");
    }
  });

  it("st8 NDA vs insurance: compliance_document_request", () => {
    const d = detectBankingComplianceOrchestratorException(ST8_NDA_INSURANCE);
    expect(d.hit).toBe(true);
    if (d.hit) {
      expect(d.primaryClass).toBe("compliance_document_request");
      expect(d.escalation_reason_code).toBe(
        ORCHESTRATOR_BC_ESCALATION_REASON_CODES.compliance_document_request,
      );
    }
  });

  it("Serbia alone does not hit payment rail", () => {
    expect(detectBankingComplianceOrchestratorException("We're visiting Serbia next month.").hit).toBe(
      false,
    );
  });

  it("generic thanks does not hit", () => {
    expect(detectBankingComplianceOrchestratorException("Thanks — the timeline works for us.").hit).toBe(
      false,
    );
  });

  it("generic insurance word alone does not hit compliance", () => {
    expect(detectBankingComplianceOrchestratorException("Do you carry insurance?").hit).toBe(false);
  });

  it("exports stable blocker token for proposals", () => {
    expect(BANKING_COMPLIANCE_EXCEPTION_BLOCKER).toBe("banking_compliance_exception");
  });
});
