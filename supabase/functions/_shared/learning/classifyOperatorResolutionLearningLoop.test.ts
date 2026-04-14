import { describe, expect, it, vi } from "vitest";
import { classifyOperatorResolutionLearningLoop } from "./classifyOperatorResolutionLearningLoop.ts";

const photographerId = "550e8400-e29b-41d4-a716-446655440000";
const escalationId = "660e8400-e29b-41d4-a716-446655440001";

function baseContext(over: Partial<{ questionBody: string; actionKey: string }> = {}) {
  return {
    escalationId,
    threadId: null,
    weddingId: null,
    actionKey: over.actionKey ?? "k",
    questionBody: over.questionBody ?? "What should we do?",
  };
}

describe("classifyOperatorResolutionLearningLoop", () => {
  it("returns EMPTY_INPUT without fetch when question and operator resolution are both empty or whitespace", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await classifyOperatorResolutionLearningLoop({
      operatorResolutionText: "",
      photographerId,
      escalationContext: baseContext({ questionBody: "" }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe("EMPTY_INPUT");
    }
    const out2 = await classifyOperatorResolutionLearningLoop({
      operatorResolutionText: "  \n\t",
      photographerId,
      escalationContext: baseContext({ questionBody: "   " }),
    });
    expect(out2.ok).toBe(false);
    if (!out2.ok) {
      expect(out2.code).toBe("EMPTY_INPUT");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
