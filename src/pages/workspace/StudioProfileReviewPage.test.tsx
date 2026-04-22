// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StudioProfileReviewPage } from "./StudioProfileReviewPage";

const fetchMock = vi.fn();
const fetchProposalsMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ photographerId: "photo-1" }),
}));

vi.mock("@/lib/assistantStudioProfileRead", () => ({
  fetchStudioProfileReviewData: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("@/lib/fetchStudioProfileChangeProposals", () => ({
  fetchStudioProfileChangeProposals: (...args: unknown[]) => fetchProposalsMock(...args),
}));

vi.mock("@/lib/reviewStudioProfileChangeProposal", () => ({
  reviewStudioProfileChangeProposal: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/applyStudioProfileChangeProposal", () => ({
  applyStudioProfileChangeProposal: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("StudioProfileReviewPage", () => {
  beforeEach(() => {
    fetchProposalsMock.mockResolvedValue({ rows: [], error: null });
    fetchMock.mockResolvedValue({
      profile: {
        hasBusinessProfileRow: true,
        identity: {
          studio_name: "Test Studio",
          manager_name: null,
          photographer_names: null,
          timezone: "UTC",
          currency: "USD",
          base_location: "Austin (US)",
          inquiry_first_step_style: null,
        },
        capability: {
          service_types: "wedding",
          core_services: "photo",
          deliverable_types: "gallery",
          geographic_scope: '{"mode":"domestic"}',
          travel_policy: null,
          language_support: null,
          team_structure: null,
          client_types: null,
          lead_acceptance_rules: null,
          service_availability: null,
          booking_scope: null,
          extensions_summary: null,
          source_type: "onboarding",
          updated_at: "2026-01-01T00:00:00Z",
        },
      },
      effectiveGeography: {
        posture: "coarse_geographic_scope",
        base_location: { label: "Austin", lat: 30, lng: -97, country_code: "US" },
        has_base_location: true,
        service_areas: [],
        has_explicit_service_areas: false,
        geographic_scope: { mode: "domestic" },
        blocked_regions: [],
      },
      proposalDiffBase: {
        settings: { studio_name: "Test Studio", timezone: "UTC", currency: "USD" },
        businessProfileJson: { service_types: ["wedding"], source_type: "onboarding" },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders scope copy distinguishing capability from playbook", async () => {
    render(<StudioProfileReviewPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/message playbook/).length).toBeGreaterThan(0);
    });
  });

  it("shows change-proposal queue copy and empty queue", async () => {
    render(<StudioProfileReviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/Change proposals \(queue\)/i)).toBeDefined();
    });
    expect(screen.getByText(/No proposals in the queue yet/i)).toBeDefined();
  });

  it("lists stored proposals when fetch returns rows", async () => {
    fetchProposalsMock.mockResolvedValue({
      rows: [
        {
          id: "prop-1",
          created_at: "2026-01-21T12:00:00.000Z",
          review_status: "pending_review",
          proposal: {
            schema_version: 1 as const,
            source: "operator" as const,
            proposed_at: "2026-01-21T11:00:00.000Z",
            rationale: "Update display name for Ana context.",
          },
          payload_error: null,
          rationale_preview: "Update display name for Ana context.",
        },
      ],
      error: null,
    });
    render(<StudioProfileReviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/prop-1/)).toBeDefined();
    });
    expect(screen.getByRole("heading", { name: /pending review/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Reject/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Withdraw \(queue\)/i })).toBeDefined();
    expect(screen.getAllByText(/Update display name for Ana context/).length).toBeGreaterThanOrEqual(1);
  });

  it("loads and shows identity and service types from fetchStudioProfileReviewData", async () => {
    render(<StudioProfileReviewPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Studio")).toBeDefined();
    });
    expect(screen.getByText("wedding")).toBeDefined();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("shows current vs proposed diff when a proposal includes bounded patches", async () => {
    fetchProposalsMock.mockResolvedValue({
      rows: [
        {
          id: "prop-diff",
          created_at: "2026-01-21T12:00:00.000Z",
          review_status: "pending_review",
          proposal: {
            schema_version: 1 as const,
            source: "operator" as const,
            proposed_at: "2026-01-21T11:00:00.000Z",
            rationale: "Adjust display name.",
            settings_patch: { studio_name: "Proposed Studio" },
            studio_business_profile_patch: { source_type: "operator" },
          },
          payload_error: null,
          rationale_preview: "Adjust display name.",
        },
      ],
      error: null,
    });
    render(<StudioProfileReviewPage />);
    await waitFor(() => {
      expect(screen.getByText(/Current vs proposed \(read-only preview\)/i)).toBeDefined();
    });
    expect(screen.getAllByText("Current (live)").length).toBe(2);
    expect(screen.getAllByText("Proposed (patch)").length).toBe(2);
    expect(screen.getAllByText("Test Studio").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Proposed Studio")).toBeDefined();
    expect(screen.getAllByText("onboarding").length).toBeGreaterThanOrEqual(1);
    const proposalCard = screen.getByText("prop-diff").closest("li");
    expect(proposalCard?.textContent).toContain("onboarding");
    expect(proposalCard?.textContent).toContain("operator");
    expect(screen.getByRole("button", { name: /Apply to live profile/i })).toBeDefined();
  });
});
