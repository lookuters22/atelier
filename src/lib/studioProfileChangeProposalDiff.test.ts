import { describe, expect, it } from "vitest";
import type { StudioProfileChangeProposalV1 } from "../types/studioProfileChangeProposal.types.ts";
import { buildStudioProfileChangeProposalDiff, type StudioProfileProposalDiffBase } from "./studioProfileChangeProposalDiff.ts";

const proposalBase = (): StudioProfileChangeProposalV1 => ({
  schema_version: 1,
  source: "operator",
  proposed_at: "2026-04-01T12:00:00.000Z",
  rationale: "Test",
});

describe("buildStudioProfileChangeProposalDiff", () => {
  it("returns isEmpty when no patches", () => {
    const base: StudioProfileProposalDiffBase = {
      settings: { studio_name: "A" },
      businessProfileJson: { service_types: ["wedding"] },
    };
    const r = buildStudioProfileChangeProposalDiff({ ...proposalBase() }, base);
    expect(r.isEmpty).toBe(true);
    expect(r.settings).toEqual([]);
    expect(r.businessProfile).toEqual([]);
  });

  it("diffs settings against live contract", () => {
    const base: StudioProfileProposalDiffBase = {
      settings: {
        studio_name: "Old Name",
        timezone: "America/Chicago",
      },
      businessProfileJson: null,
    };
    const r = buildStudioProfileChangeProposalDiff(
      {
        ...proposalBase(),
        settings_patch: { studio_name: "New Name" },
      },
      base,
    );
    expect(r.isEmpty).toBe(false);
    expect(r.settings).toHaveLength(1);
    expect(r.settings[0].key).toBe("studio_name");
    expect(r.settings[0].currentDisplay).toBe("Old Name");
    expect(r.settings[0].proposedDisplay).toBe("New Name");
  });

  it("shows business profile current from row json and proposed from patch", () => {
    const base: StudioProfileProposalDiffBase = {
      settings: {},
      businessProfileJson: {
        service_types: ["a", "b"],
        geographic_scope: { mode: "domestic" },
      },
    };
    const r = buildStudioProfileChangeProposalDiff(
      {
        ...proposalBase(),
        studio_business_profile_patch: {
          service_types: ["wedding"],
        },
      },
      base,
    );
    expect(r.businessProfile).toHaveLength(1);
    expect(r.businessProfile[0].currentDisplay).toContain("a");
    expect(r.businessProfile[0].proposedDisplay).toContain("wedding");
  });

  it("marks current as unavailable when profile did not load", () => {
    const base: StudioProfileProposalDiffBase = { settings: { studio_name: "X" }, businessProfileJson: {} };
    const r = buildStudioProfileChangeProposalDiff(
      { ...proposalBase(), settings_patch: { studio_name: "Y" } },
      base,
      { currentUnavailable: true },
    );
    expect(r.settings[0].currentDisplay).toBe("—");
    expect(r.settings[0].proposedDisplay).toBe("Y");
  });

  it("formats base_location on both sides using structured contract", () => {
    const base: StudioProfileProposalDiffBase = {
      settings: {
        base_location: {
          schema_version: 1,
          provider_id: "x",
          label: "Oslo",
          kind: "city",
          provider: "bundled",
          centroid: [10.7, 59.9],
          bbox: [0, 0, 1, 1],
          country_code: "NO",
          selected_at: "2026-01-01T00:00:00.000Z",
        },
      },
      businessProfileJson: null,
    };
    const r = buildStudioProfileChangeProposalDiff(
      {
        ...proposalBase(),
        settings_patch: {
          base_location: {
            schema_version: 1,
            provider_id: "y",
            label: "Bergen",
            kind: "city",
            provider: "bundled",
            centroid: [5, 60],
            bbox: [0, 0, 1, 1],
            country_code: "NO",
            selected_at: "2026-01-02T00:00:00.000Z",
          },
        },
      },
      base,
    );
    expect(r.settings[0].currentDisplay).toContain("Oslo");
    expect(r.settings[0].proposedDisplay).toContain("Bergen");
  });

  it("shows no business profile row on current side", () => {
    const base: StudioProfileProposalDiffBase = { settings: {}, businessProfileJson: null };
    const r = buildStudioProfileChangeProposalDiff(
      { ...proposalBase(), studio_business_profile_patch: { source_type: "manual" } },
      base,
    );
    expect(r.businessProfile[0].currentDisplay).toContain("no business profile row");
    expect(r.businessProfile[0].proposedDisplay).toContain("manual");
  });
});
