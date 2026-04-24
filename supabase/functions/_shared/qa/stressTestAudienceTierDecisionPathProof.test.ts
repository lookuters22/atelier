/**
 * Stress-test-shaped proofs for thread `audience_tier` ↔ participant `visibilityClass` alignment
 * on the real reply memory path (see docs/v3/REAL_THREADS_ANALYSIS_AND_PROPOSALS.md §6a,
 * REAL_CONVERSATION_STRESS_TEST_PLAN Phase 1).
 */
import { describe, expect, it } from "vitest";
import { combineThreadAudienceTierWithVisibilityClass } from "../memory/memoryAudienceTierPolicy.ts";
import { evaluateVerifierPolicyGate } from "../tools/verifierPolicyGate.ts";
import { VERIFIER_REASON_CODES } from "../../../../src/types/verifier.types.ts";

describe("Stress — audience tier alignment (decision-path shaped)", () => {
  it("mixed audience never inherits permissive DB tier for memory gating", () => {
    expect(combineThreadAudienceTierWithVisibilityClass("operator_only", "mixed_audience")).toBe(
      "client_visible",
    );
    expect(combineThreadAudienceTierWithVisibilityClass("internal_team", "mixed_audience")).toBe(
      "client_visible",
    );
  });

  it("planner-only visibility still allows internal_team memories when DB column is default", () => {
    expect(combineThreadAudienceTierWithVisibilityClass("client_visible", "planner_only")).toBe(
      "internal_team",
    );
  });

  it("verifier stays conservative when mixed_audience + memories (draft review)", () => {
    const ev = evaluateVerifierPolicyGate(
      {
        audience: {
          visibilityClass: "mixed_audience",
          clientVisibleForPrivateCommercialRedaction: true,
          broadcastRisk: "unknown",
          recipientCount: 2,
        },
        playbookRules: [
          {
            id: "r1",
            action_key: "send_message",
            decision_mode: "auto",
            topic: null,
            is_active: true,
          },
        ],
        selectedMemoriesSummary: [{ id: "m1", type: "preference" }],
        globalKnowledgeLoadedCount: 0,
        escalationOpenCount: 0,
      },
      "auto",
    );
    expect(ev.outcome).toBe("coerce");
    if (ev.outcome === "coerce") {
      expect(ev.reasonCodes).toContain(VERIFIER_REASON_CODES.COMMERCIAL_CLIENT_VISIBLE_MEMORY_REVIEW);
    }
  });
});
