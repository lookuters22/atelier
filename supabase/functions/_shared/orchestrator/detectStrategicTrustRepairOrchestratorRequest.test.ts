import { describe, expect, it } from "vitest";
import { detectStrategicTrustRepairOrchestratorRequest } from "./detectStrategicTrustRepairOrchestratorRequest.ts";
import { ORCHESTRATOR_STR_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

describe("detectStrategicTrustRepairOrchestratorRequest", () => {
  it("matches stress-test fully booked vs exception with temporal contrast", () => {
    const r = detectStrategicTrustRepairOrchestratorRequest(
      "I'm confused — last week Ana said you were fully booked and couldn't take our date, but today the email says you'd happily make an exception. Which is accurate?",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("contradiction_or_expectation_repair_request");
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_STR_ESCALATION_REASON_CODES.contradiction_or_expectation_repair_request,
      );
    }
  });

  it("matches explicit contradiction + earlier told", () => {
    expect(
      detectStrategicTrustRepairOrchestratorRequest(
        "This contradicts what we were told earlier about the retainer schedule.",
      ).hit,
    ).toBe(true);
  });

  it("matches last time + something different", () => {
    expect(
      detectStrategicTrustRepairOrchestratorRequest(
        "Last time we were told something different about travel being included.",
      ).hit,
    ).toBe(true);
  });

  it("matches you said + now suddenly", () => {
    expect(
      detectStrategicTrustRepairOrchestratorRequest(
        "You said there was no availability before — now suddenly there is a slot on our date?",
      ).hit,
    ).toBe(true);
  });

  it("does not match sentiment-only confusion", () => {
    expect(
      detectStrategicTrustRepairOrchestratorRequest("I'm confused about the timeline for edits.").hit,
    ).toBe(false);
  });

  it("does not match prior reference without mismatch signal", () => {
    expect(
      detectStrategicTrustRepairOrchestratorRequest(
        "You said June for the engagement session — thanks for confirming.",
      ).hit,
    ).toBe(false);
  });

  it("does not match artistic critique (NC lane, not STR)", () => {
    expect(
      detectStrategicTrustRepairOrchestratorRequest(
        "The wedding day colors look fake, my hair looks yellow in the photos, and some crops feel weird.",
      ).hit,
    ).toBe(false);
  });
});
