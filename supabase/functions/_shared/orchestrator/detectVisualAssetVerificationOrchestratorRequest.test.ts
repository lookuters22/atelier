import { describe, expect, it } from "vitest";
import { detectVisualAssetVerificationOrchestratorRequest } from "./detectVisualAssetVerificationOrchestratorRequest.ts";
import { ORCHESTRATOR_VAV_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

describe("detectVisualAssetVerificationOrchestratorRequest", () => {
  it("st6 harness: album cover mockup PDF + confirm spelling before print → layout_proof_review", () => {
    const r = detectVisualAssetVerificationOrchestratorRequest(
      "Attached is the album cover mockup PDF — please confirm the spelling Karissa before we print.",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("layout_proof_review");
      expect(r.escalation_reason_code).toBe(ORCHESTRATOR_VAV_ESCALATION_REASON_CODES.layout_proof_review);
    }
  });

  it("pre_print_publication_verification when confirm+print+cue without layout phrase", () => {
    const r = detectVisualAssetVerificationOrchestratorRequest(
      "Please confirm the spelling on the cover PDF before we print.",
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("pre_print_publication_verification");
    }
  });

  it("does not hit on generic album praise", () => {
    expect(
      detectVisualAssetVerificationOrchestratorRequest("We love the album photos you shared!").hit,
    ).toBe(false);
  });

  it("does not hit on confirm before print without visual asset cues", () => {
    expect(
      detectVisualAssetVerificationOrchestratorRequest("Please confirm before we print.").hit,
    ).toBe(false);
  });

  it("does not hit on benign scheduling", () => {
    expect(
      detectVisualAssetVerificationOrchestratorRequest("Can we schedule a call next week?").hit,
    ).toBe(false);
  });
});
