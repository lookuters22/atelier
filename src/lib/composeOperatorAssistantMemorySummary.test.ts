import { describe, expect, it } from "vitest";
import { composeOperatorAssistantMemorySummaryForStorage } from "./composeOperatorAssistantMemorySummary.ts";

describe("composeOperatorAssistantMemorySummaryForStorage", () => {
  it("uses outcome only when supplementary is empty", () => {
    expect(composeOperatorAssistantMemorySummaryForStorage("Approved 10% off", "", 400)).toBe("Approved 10% off");
  });

  it("dedupes when supplementary equals outcome", () => {
    expect(composeOperatorAssistantMemorySummaryForStorage("No EU travel-only", "No EU travel-only", 400)).toBe(
      "No EU travel-only",
    );
  });

  it("joins outcome and supplementary with em dash", () => {
    expect(
      composeOperatorAssistantMemorySummaryForStorage("Deposit split 50/50", "Exception logged for Smith wedding", 400),
    ).toBe("Deposit split 50/50 — Exception logged for Smith wedding");
  });

  it("truncates composed string to maxLen", () => {
    const o = "x".repeat(200);
    const s = "y".repeat(250);
    const out = composeOperatorAssistantMemorySummaryForStorage(o, s, 80);
    expect(out.length).toBe(80);
    expect(out.startsWith("x")).toBe(true);
  });

  it("falls back to supplementary when outcome is blank (edge)", () => {
    expect(composeOperatorAssistantMemorySummaryForStorage("", "Legacy line only", 400)).toBe("Legacy line only");
  });
});
