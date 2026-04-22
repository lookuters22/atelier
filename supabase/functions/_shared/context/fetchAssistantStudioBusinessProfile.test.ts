import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fromSrc from "../../../../src/lib/assistantStudioProfileRead.ts";
import {
  fetchAssistantStudioBusinessProfile,
  mapSettingsToAssistantStudioIdentity,
  summarizeProfileJsonField,
} from "./fetchAssistantStudioBusinessProfile.ts";

vi.mock("../../../../src/lib/photographerSettings.ts", () => ({
  readPhotographerSettings: vi.fn(),
}));

import { readPhotographerSettings } from "../../../../src/lib/photographerSettings.ts";

describe("edge fetchAssistantStudioBusinessProfile re-export", () => {
  it("re-exports the same bindings as src/lib/assistantStudioProfileRead (entry used by buildAssistantContext)", () => {
    expect(fetchAssistantStudioBusinessProfile).toBe(fromSrc.fetchAssistantStudioBusinessProfile);
    expect(summarizeProfileJsonField).toBe(fromSrc.summarizeProfileJsonField);
    expect(mapSettingsToAssistantStudioIdentity).toBe(fromSrc.mapSettingsToAssistantStudioIdentity);
  });
});

describe("fetchAssistantStudioBusinessProfile (via edge re-export, Deno-safe src graph)", () => {
  beforeEach(() => {
    vi.mocked(readPhotographerSettings).mockReset();
  });

  it("summarizeProfileJsonField handles primitives, arrays, and objects", () => {
    expect(summarizeProfileJsonField(null, 100)).toBeNull();
    expect(summarizeProfileJsonField(["wedding", "video"], 100)).toBe("wedding, video");
    expect(summarizeProfileJsonField([], 100)).toBeNull();
    expect(summarizeProfileJsonField("  hi  ", 10)).toBe("hi");
    expect(summarizeProfileJsonField({ a: 1 }, 500)).toContain("a");
  });

  it("mapSettingsToAssistantStudioIdentity uses contract fields only", () => {
    const id = mapSettingsToAssistantStudioIdentity({
      raw: {},
      contract: {
        studio_name: "  Nova  ",
        currency: "EUR",
        timezone: "Europe/Berlin",
        inquiry_first_step_style: "soft_packages",
      },
    });
    expect(id.studio_name).toBe("Nova");
    expect(id.currency).toBe("EUR");
    expect(id.timezone).toBe("Europe/Berlin");
    expect(id.inquiry_first_step_style).toBe("soft_packages");
    expect(id.base_location).toBeNull();
  });

  it("happy path merges studio_business_profiles row with settings", async () => {
    vi.mocked(readPhotographerSettings).mockResolvedValue({
      raw: {},
      contract: { currency: "USD", studio_name: "Acme Photo", timezone: "America/New_York" },
    });

    const row = {
      service_types: ["wedding", "video"],
      service_availability: {},
      geographic_scope: { mode: "domestic" },
      travel_policy: {},
      booking_scope: {},
      client_types: [],
      deliverable_types: ["digital"],
      lead_acceptance_rules: {},
      language_support: ["en"],
      team_structure: {},
      extensions: {},
      core_services: [],
      source_type: "onboarding",
      updated_at: "2026-01-02T00:00:00.000Z",
    };

    const supabase = {
      from: (table: string) => {
        if (table !== "studio_business_profiles") {
          throw new Error(`unexpected table ${table}`);
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: row, error: null }),
            }),
          }),
        };
      },
    } as never;

    const out = await fetchAssistantStudioBusinessProfile(supabase, "photo-uuid");
    expect(out.hasBusinessProfileRow).toBe(true);
    expect(out.identity.currency).toBe("USD");
    expect(out.identity.studio_name).toBe("Acme Photo");
    expect(out.capability?.service_types).toMatch(/video/);
    expect(out.capability?.geographic_scope).toContain("domestic");
  });

  it("missing studio_business_profiles row returns capability null but still loads identity", async () => {
    vi.mocked(readPhotographerSettings).mockResolvedValue({
      raw: {},
      contract: { currency: "GBP" },
    });

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    } as never;

    const out = await fetchAssistantStudioBusinessProfile(supabase, "photo-uuid");
    expect(out.hasBusinessProfileRow).toBe(false);
    expect(out.capability).toBeNull();
    expect(out.identity.currency).toBe("GBP");
  });
});
