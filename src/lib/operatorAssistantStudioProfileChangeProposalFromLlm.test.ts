import { describe, expect, it, vi, afterEach } from "vitest";
import { insertStudioProfileChangeProposal } from "./insertStudioProfileChangeProposal.ts";
import {
  buildStudioProfileChangeProposalV1ForConfirm,
  tryParseLlmProposedStudioProfileChange,
} from "./operatorAssistantStudioProfileChangeProposalFromLlm.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("tryParseLlmProposedStudioProfileChange", () => {
  it("accepts a valid settings + business profile proposal", () => {
    const r = tryParseLlmProposedStudioProfileChange({
      kind: "studio_profile_change_proposal",
      rationale: "Switch to EUR and add commercial.",
      settings_patch: { currency: "EUR" },
      studio_business_profile_patch: { service_types: ["wedding", "commercial"] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe("studio_profile_change_proposal");
      expect(r.value.settings_patch?.currency).toBe("EUR");
    }
  });

  it("drops unknown patch keys (fail-closed allowlist)", () => {
    const r = tryParseLlmProposedStudioProfileChange({
      kind: "studio_profile_change_proposal",
      rationale: "Patch with junk key",
      settings_patch: { currency: "GBP", whatsapp_number: "bad" } as Record<string, unknown>,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.settings_patch).toEqual({ currency: "GBP" });
    }
  });

  it("rejects rationale-only (no patch keys)", () => {
    const r = tryParseLlmProposedStudioProfileChange({
      kind: "studio_profile_change_proposal",
      rationale: "No actual patch",
    });
    expect(r.ok).toBe(false);
  });
});

describe("confirm path via insertStudioProfileChangeProposal", () => {
  it("inserts a pending-review row when proposal is built for confirm", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T15:00:00.000Z"));
    const parsed = tryParseLlmProposedStudioProfileChange({
      kind: "studio_profile_change_proposal",
      rationale: "Timezone to London",
      settings_patch: { timezone: "Europe/London" },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const v1 = buildStudioProfileChangeProposalV1ForConfirm(parsed.value);
    expect(v1.proposed_at).toBe("2026-03-10T15:00:00.000Z");
    expect(v1.source).toBe("operator_assistant");

    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "prop-row-1" }, error: null }),
          })),
        })),
      })),
    } as never;

    const out = await insertStudioProfileChangeProposal(supabase, "user-uid-1", v1);
    expect(out.error).toBeNull();
    expect(out.id).toBe("prop-row-1");
  });
});
