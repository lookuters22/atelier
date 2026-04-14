import { describe, expect, it } from "vitest";
import { detectHighMagnitudeClientConcessionOrchestratorRequest } from "./detectHighMagnitudeClientConcessionOrchestratorRequest.ts";
import { ORCHESTRATOR_CCM_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

const client = {
  bucket: "client_primary" as const,
  personId: "p1",
  isApprovalContact: false,
  source: "thread_sender" as const,
};

const planner = {
  bucket: "planner" as const,
  personId: "p2",
  isApprovalContact: false,
  source: "thread_sender" as const,
};

describe("detectHighMagnitudeClientConcessionOrchestratorRequest", () => {
  it("hits st7 reduce-to + cannot approve + two amounts", () => {
    const r = detectHighMagnitudeClientConcessionOrchestratorRequest({
      rawMessage:
        "Parya here — please reduce the price to €18,000 all-in including travel. I cannot approve €21,700.",
      authority: client,
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_CCM_ESCALATION_REASON_CODES.high_magnitude_client_concession_request,
      );
    }
  });

  it("hits st4 jumbo bulk + work on the price", () => {
    const r = detectHighMagnitudeClientConcessionOrchestratorRequest({
      rawMessage:
        "If we order three of the jumbo Reflections albums, would it be possible to work on the price a bit?",
      authority: client,
    });
    expect(r.hit).toBe(true);
  });

  it("hits from € to € with >=12% drop", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage: "Can you move the quote from €39,000 down to €30,000 for the same package?",
        authority: client,
      }).hit,
    ).toBe(true);
  });

  it("hits hard cap + amount", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage: "Our hard cap is €25,000 total — we cannot go higher.",
        authority: client,
      }).hit,
    ).toBe(true);
  });

  it("hits >=20% off ask", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage: "Is there any way to get 25% off the listed package?",
        authority: client,
      }).hit,
    ).toBe(true);
  });

  it("does not hit <20% off", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage: "Could we get 10% off if we pay early?",
        authority: client,
      }).hit,
    ).toBe(false);
  });

  it("does not hit planner with same st7 body (AP1 territory)", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage:
          "Please reduce the price to €18,000. I cannot approve €21,700.",
        authority: planner,
      }).hit,
    ).toBe(false);
  });

  it("does not hit innocent deposit question", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage: "What is the deposit amount to hold the date?",
        authority: client,
      }).hit,
    ).toBe(false);
  });

  it("does not hit payer bucket false for vendor", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage: "Please reduce the price to €1 and €9999 testing.",
        authority: {
          bucket: "vendor",
          personId: "v1",
          isApprovalContact: false,
          source: "thread_sender",
        },
      }).hit,
    ).toBe(false);
  });

  it("hits payer bucket", () => {
    expect(
      detectHighMagnitudeClientConcessionOrchestratorRequest({
        rawMessage:
          "Please reduce the fee to €5,000 — I cannot approve €8,000 on this card.",
        authority: {
          bucket: "payer",
          personId: "pay1",
          isApprovalContact: false,
          source: "thread_sender",
        },
      }).hit,
    ).toBe(true);
  });
});
