import { describe, expect, it } from "vitest";
import {
  defaultBoundedNearMatchLinkResolutionSummary,
  isBoundedNearMatchThreadLinkEscalation,
  parseBoundedNearMatchDecisionJustification,
} from "./boundedNearMatchThreadLinkEscalation.ts";

describe("boundedNearMatchThreadLinkEscalation", () => {
  it("isBoundedNearMatchThreadLinkEscalation matches action + reason pair", () => {
    expect(
      isBoundedNearMatchThreadLinkEscalation("request_thread_wedding_link", "bounded_matchmaker_near_match"),
    ).toBe(true);
    expect(isBoundedNearMatchThreadLinkEscalation("other", "bounded_matchmaker_near_match")).toBe(false);
    expect(isBoundedNearMatchThreadLinkEscalation("request_thread_wedding_link", "other")).toBe(false);
  });

  it("parseBoundedNearMatchDecisionJustification reads candidate, score, reasoning", () => {
    const p = parseBoundedNearMatchDecisionJustification({
      candidate_wedding_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      confidence_score: 82,
      matchmaker_reasoning: "Same venue and date window as existing project.",
    });
    expect(p?.candidateWeddingId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(p?.confidenceScore).toBe(82);
    expect(p?.matchmakerReasoning).toContain("venue");
  });

  it("parseBoundedNearMatchDecisionJustification returns null without candidate id", () => {
    expect(parseBoundedNearMatchDecisionJustification({ confidence_score: 80 })).toBeNull();
  });

  it("defaultBoundedNearMatchLinkResolutionSummary includes uuid hint", () => {
    const id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const s = defaultBoundedNearMatchLinkResolutionSummary(id);
    expect(s).toContain("bbbbbbbb");
    expect(s).toContain(id);
  });
});
