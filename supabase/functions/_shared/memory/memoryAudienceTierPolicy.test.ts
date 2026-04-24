import { describe, expect, it } from "vitest";
import {
  combineThreadAudienceTierWithVisibilityClass,
  filterMemoryHeadersForThreadAudienceTier,
  filterSelectedMemoriesForThreadAudienceTier,
  memoryAudienceAllowedForThreadTier,
  parseMemoryAudienceTier,
  parseThreadAudienceTier,
} from "./memoryAudienceTierPolicy.ts";

describe("memoryAudienceTierPolicy", () => {
  it("parseMemoryAudienceTier accepts known tiers only", () => {
    expect(parseMemoryAudienceTier("internal_team")).toBe("internal_team");
    expect(parseMemoryAudienceTier(null)).toBeNull();
    expect(parseMemoryAudienceTier("")).toBeNull();
    expect(parseMemoryAudienceTier("nope")).toBeNull();
  });

  it("parseThreadAudienceTier defaults invalid to client_visible", () => {
    expect(parseThreadAudienceTier("operator_only")).toBe("operator_only");
    expect(parseThreadAudienceTier(null)).toBe("client_visible");
    expect(parseThreadAudienceTier("garbage")).toBe("client_visible");
  });

  it("client_visible thread excludes internal_team and operator_only memories", () => {
    expect(memoryAudienceAllowedForThreadTier("client_visible", "client_visible")).toBe(true);
    expect(memoryAudienceAllowedForThreadTier(null, "client_visible")).toBe(true);
    expect(memoryAudienceAllowedForThreadTier("internal_team", "client_visible")).toBe(false);
    expect(memoryAudienceAllowedForThreadTier("operator_only", "client_visible")).toBe(false);
  });

  it("internal_team thread allows client_visible and internal_team memories only", () => {
    expect(memoryAudienceAllowedForThreadTier("client_visible", "internal_team")).toBe(true);
    expect(memoryAudienceAllowedForThreadTier("internal_team", "internal_team")).toBe(true);
    expect(memoryAudienceAllowedForThreadTier("operator_only", "internal_team")).toBe(false);
  });

  it("operator_only thread allows all tagged tiers", () => {
    expect(memoryAudienceAllowedForThreadTier("operator_only", "operator_only")).toBe(true);
    expect(memoryAudienceAllowedForThreadTier("internal_team", "operator_only")).toBe(true);
  });

  it("filterMemoryHeadersForThreadAudienceTier drops planner-tier facts for client-visible context", () => {
    const headers = [
      { id: "pub", audience_source_tier: null as const },
      { id: "planner", audience_source_tier: "internal_team" as const },
      { id: "studio", audience_source_tier: "operator_only" as const },
    ];
    const out = filterMemoryHeadersForThreadAudienceTier(headers, "client_visible");
    expect(out.map((h) => h.id)).toEqual(["pub"]);
  });

  it("combineThreadAudienceTierWithVisibilityClass — mixed audience forces client_visible tier (strict)", () => {
    expect(
      combineThreadAudienceTierWithVisibilityClass("operator_only", "mixed_audience"),
    ).toBe("client_visible");
    expect(
      combineThreadAudienceTierWithVisibilityClass("internal_team", "mixed_audience"),
    ).toBe("client_visible");
  });

  it("combineThreadAudienceTierWithVisibilityClass — planner_only widens default DB client_visible to internal_team", () => {
    expect(
      combineThreadAudienceTierWithVisibilityClass("client_visible", "planner_only"),
    ).toBe("internal_team");
  });

  it("combineThreadAudienceTierWithVisibilityClass — client_visible visibility stays strict vs loose DB", () => {
    expect(
      combineThreadAudienceTierWithVisibilityClass("operator_only", "client_visible"),
    ).toBe("client_visible");
  });

  it("filterSelectedMemoriesForThreadAudienceTier drops operator_only rows for internal_team reply", () => {
    const out = filterSelectedMemoriesForThreadAudienceTier(
      [
        { id: "1", audience_source_tier: "internal_team" },
        { id: "2", audience_source_tier: "operator_only" },
      ],
      "internal_team",
    );
    expect(out.map((m) => m.id)).toEqual(["1"]);
  });
});
