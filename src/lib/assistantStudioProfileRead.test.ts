import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchStudioProfileReviewData, summarizeProfileJsonField } from "./assistantStudioProfileRead";

vi.mock("./photographerSettings.ts", () => ({
  readPhotographerSettings: vi.fn(),
}));

import { readPhotographerSettings } from "./photographerSettings.ts";

describe("fetchStudioProfileReviewData", () => {
  beforeEach(() => {
    vi.mocked(readPhotographerSettings).mockReset();
  });

  it("includes effective geography alongside profile", async () => {
    vi.mocked(readPhotographerSettings).mockResolvedValue({
      raw: { base_location: { label: "Oslo", lat: 59.9, lng: 10.7, country_code: "NO" } },
      contract: {} as never,
    });

    const row = {
      service_types: ["wedding"],
      service_availability: {},
      geographic_scope: { mode: "domestic", blocked_regions: [] },
      travel_policy: {},
      booking_scope: {},
      client_types: [],
      deliverable_types: [],
      lead_acceptance_rules: {},
      language_support: [],
      team_structure: {},
      extensions: { service_areas: [] },
      core_services: [],
      source_type: "onboarding",
      updated_at: "2026-01-02T00:00:00.000Z",
    };

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
      }),
    } as never;

    const { profile, effectiveGeography, proposalDiffBase } = await fetchStudioProfileReviewData(supabase, "photo-uuid");
    expect(profile.hasBusinessProfileRow).toBe(true);
    expect(effectiveGeography.posture).toBe("coarse_geographic_scope");
    expect(effectiveGeography.service_areas).toEqual([]);
    expect(proposalDiffBase.businessProfileJson).toEqual(
      expect.objectContaining({
        service_types: ["wedding"],
        geographic_scope: { mode: "domestic", blocked_regions: [] },
      }),
    );
  });

  it("exports summarizeProfileJsonField for UI/LLM clipping", () => {
    expect(summarizeProfileJsonField([1, 2], 10)).toBe("1, 2");
  });
});
