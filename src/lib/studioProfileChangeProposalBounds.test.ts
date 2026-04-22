import { describe, expect, it } from "vitest";
import {
  formatStudioProfileChangeProposalForReview,
  validateStudioProfileChangeProposalV1,
} from "./studioProfileChangeProposalBounds";

const minimalValid = (extra?: Record<string, unknown>) => ({
  schema_version: 1,
  source: "operator_assistant" as const,
  proposed_at: "2026-01-15T10:00:00.000Z",
  rationale: "Align currency with accounting",
  ...extra,
});

describe("validateStudioProfileChangeProposalV1", () => {
  it("accepts minimal valid proposal", () => {
    const r = validateStudioProfileChangeProposalV1(minimalValid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.source).toBe("operator_assistant");
    }
  });

  it("rejects wrong schema version", () => {
    const r = validateStudioProfileChangeProposalV1({ ...minimalValid(), schema_version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("schema_version");
  });

  it("rejects unknown settings key", () => {
    const r = validateStudioProfileChangeProposalV1(
      minimalValid({ settings_patch: { currency: "CAD", not_a_key: 1 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not_a_key");
  });

  it("rejects disallowed bookkeeping / contact settings keys (not in studio-profile proposal domain)", () => {
    for (const badKey of ["whatsapp_number", "playbook_version", "onboarding_completed_at", "admin_mobile_number"] as const) {
      const r = validateStudioProfileChangeProposalV1(
        minimalValid({ settings_patch: { currency: "CAD", [badKey]: "x" } }),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(badKey);
    }
  });

  it("accepts allowed studio-profile settings keys", () => {
    const r = validateStudioProfileChangeProposalV1(
      minimalValid({
        settings_patch: {
          studio_name: "Acme",
          timezone: "Europe/London",
          inquiry_first_step_style: "soft_packages",
        },
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects unknown business profile key", () => {
    const r = validateStudioProfileChangeProposalV1(
      minimalValid({ studio_business_profile_patch: { service_types: [], core_services: [] } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("core_services");
  });

  it("rejects top-level extra keys", () => {
    const r = validateStudioProfileChangeProposalV1({ ...minimalValid(), extra: 1 } as never);
    expect(r.ok).toBe(false);
  });

  it("accepts patch with valid biz keys", () => {
    const r = validateStudioProfileChangeProposalV1(
      minimalValid({
        studio_business_profile_patch: { travel_policy: { allows_international: true } },
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("formatStudioProfileChangeProposalForReview", () => {
  it("renders settings and profile patches with clipped JSON", () => {
    const v = validateStudioProfileChangeProposalV1(
      minimalValid({
        settings_patch: { currency: "EUR", studio_name: "Acme Studio" },
        studio_business_profile_patch: { service_types: ["weddings"] },
      }),
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const lines = formatStudioProfileChangeProposalForReview(v.value);
    expect(lines.join("\n")).toContain("EUR");
    expect(lines.join("\n")).toContain("Acme Studio");
    expect(lines.join("\n")).toContain("weddings");
    expect(lines.some((l) => l.includes("Rationale:"))).toBe(true);
  });
});
