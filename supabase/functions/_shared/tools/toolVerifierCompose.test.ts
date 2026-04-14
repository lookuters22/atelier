import { describe, expect, it } from "vitest";
import { VERIFIER_REASON_CODES } from "../../../../src/types/verifier.types.ts";
import { composeToolVerifierAgentResult } from "./toolVerifierCompose.ts";

describe("composeToolVerifierAgentResult", () => {
  it("blocks high broadcast + auto", () => {
    const r = composeToolVerifierAgentResult(
      {
        broadcastRisk: "high",
        requestedExecutionMode: "auto",
        policyGate: {
          audience: {
            visibilityClass: "client_visible",
            clientVisibleForPrivateCommercialRedaction: true,
            broadcastRisk: "high",
            recipientCount: 4,
          },
          playbookRules: [],
          selectedMemoriesSummary: [],
          globalKnowledgeLoadedCount: 0,
          escalationOpenCount: 0,
        },
      },
      "photo-1",
    );
    expect(r.success).toBe(false);
    expect(r.facts?.policyVerdict).toBe("hard_block");
    expect(r.facts?.verifierStage).toBe("block");
    expect(r.facts?.pipelineHaltsBeforeExternalSend).toBe(true);
    expect(r.facts?.preGenerationVerifier).toBe(true);
    expect(r.facts?.outputAuditor).toBe(false);
    expect((r.facts?.reasonCodes as string[]).includes(VERIFIER_REASON_CODES.BROADCAST_HIGH_BLOCKS_AUTO)).toBe(
      true,
    );
  });

  it("coerces auto to draft when policy gate requires draft_only", () => {
    const r = composeToolVerifierAgentResult(
      {
        broadcastRisk: "low",
        requestedExecutionMode: "auto",
        policyGate: {
          audience: {
            visibilityClass: "client_visible",
            clientVisibleForPrivateCommercialRedaction: true,
            broadcastRisk: "low",
            recipientCount: 2,
          },
          playbookRules: [
            {
              id: "x",
              action_key: "send_message",
              decision_mode: "draft_only",
              topic: "t",
              is_active: true,
            },
          ],
          selectedMemoriesSummary: [],
          globalKnowledgeLoadedCount: 0,
          escalationOpenCount: 0,
        },
      },
      "photo-1",
    );
    expect(r.success).toBe(true);
    expect(r.facts?.policyVerdict).toBe("require_draft_only");
    expect(r.facts?.verifierStage).toBe("draft_only");
    expect(r.facts?.pipelineHaltsBeforeExternalSend).toBe(true);
    expect(Array.isArray(r.facts?.reasonCodes)).toBe(true);
  });

  it("allows auto when policy gate passes", () => {
    const r = composeToolVerifierAgentResult(
      {
        broadcastRisk: "low",
        requestedExecutionMode: "auto",
        policyGate: {
          audience: {
            visibilityClass: "client_visible",
            clientVisibleForPrivateCommercialRedaction: true,
            broadcastRisk: "low",
            recipientCount: 2,
          },
          playbookRules: [],
          selectedMemoriesSummary: [],
          globalKnowledgeLoadedCount: 0,
          escalationOpenCount: 0,
        },
      },
      "photo-1",
    );
    expect(r.success).toBe(true);
    expect(r.facts?.policyVerdict).toBe("allow_auto");
    expect(r.facts?.verifierStage).toBe("allow_auto");
    expect(r.facts?.pipelineHaltsBeforeExternalSend).toBe(false);
    expect((r.facts?.reasonCodes as string[]).includes(VERIFIER_REASON_CODES.SAFE)).toBe(true);
  });
});
