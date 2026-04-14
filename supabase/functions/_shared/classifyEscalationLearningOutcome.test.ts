import { describe, expect, it, vi } from "vitest";
import { classifyEscalationLearningOutcome } from "./classifyEscalationLearningOutcome.ts";

describe("classifyEscalationLearningOutcome", () => {
  it("returns one_off_case without fetch when question, reply, and resolution are all empty or whitespace", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      classifyEscalationLearningOutcome({
        questionBody: "",
        photographerReply: "",
        resolutionSummary: "",
      }),
    ).resolves.toBe("one_off_case");
    await expect(
      classifyEscalationLearningOutcome({
        questionBody: "  \n",
        photographerReply: "\t",
        resolutionSummary: "   ",
      }),
    ).resolves.toBe("one_off_case");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
