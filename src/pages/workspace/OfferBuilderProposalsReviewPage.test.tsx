// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { defaultPuckData } from "@/lib/offerPuckNormalize";
import { OfferBuilderProposalsReviewPage } from "./OfferBuilderProposalsReviewPage";

const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";
const fetchProposalsMock = vi.fn();
const listProjectsMock = vi.fn();
const reviewOfferBuilderMock = vi.fn();
const applyOfferBuilderMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ photographerId: "photo-1" }),
}));

vi.mock("@/lib/fetchOfferBuilderChangeProposals", () => ({
  fetchOfferBuilderChangeProposals: (...args: unknown[]) => fetchProposalsMock(...args),
}));

vi.mock("@/lib/offerProjectsStorage", () => ({
  listOfferProjects: (...args: unknown[]) => listProjectsMock(...args),
}));

vi.mock("@/lib/reviewOfferBuilderChangeProposal", () => ({
  reviewOfferBuilderChangeProposal: (...args: unknown[]) => reviewOfferBuilderMock(...args),
}));

vi.mock("@/lib/applyOfferBuilderChangeProposal", () => ({
  applyOfferBuilderChangeProposal: (...args: unknown[]) => applyOfferBuilderMock(...args),
}));

describe("OfferBuilderProposalsReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewOfferBuilderMock.mockResolvedValue({ ok: true });
    applyOfferBuilderMock.mockResolvedValue({ ok: true });
    listProjectsMock.mockResolvedValue([
      { id: pid, name: "My Offer", updatedAt: "2026-01-01T00:00:00.000Z", data: defaultPuckData() },
    ]);
  });

  it("renders pending and reviewed sections with proposal copy", async () => {
    fetchProposalsMock.mockResolvedValue({
      rows: [
        {
          id: "p1",
          created_at: "2026-04-20T10:00:00.000Z",
          review_status: "pending_review",
          project_id: pid,
          proposal: {
            schema_version: 1,
            source: "operator_assistant",
            proposed_at: "2026-04-20T10:00:00.000Z",
            rationale: "Rename",
            project_id: pid,
            metadata_patch: { name: "X" },
          },
          payload_error: null,
          rationale_preview: "Rename",
        },
        {
          id: "p2",
          created_at: "2026-04-19T10:00:00.000Z",
          review_status: "rejected",
          project_id: pid,
          proposal: {
            schema_version: 1,
            source: "operator_assistant",
            proposed_at: "2026-04-19T10:00:00.000Z",
            rationale: "Old",
            project_id: pid,
            metadata_patch: { root_title: "Y" },
          },
          payload_error: null,
          rationale_preview: "Old",
        },
      ],
      error: null,
    });

    render(
      <MemoryRouter>
        <OfferBuilderProposalsReviewPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Pending review")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("Rename")).toBeDefined();
    });
    expect(screen.getByText("Reviewed / closed")).toBeDefined();
    expect(screen.getByText("Old")).toBeDefined();
    expect(screen.getByText(/apply_offer_builder_change_proposal_v1/i)).toBeDefined();
  });

  it("reject triggers RPC and refetches proposals without full-page loading flash", async () => {
    const pendingRow = {
      id: "p1",
      created_at: "2026-04-20T10:00:00.000Z",
      review_status: "pending_review" as const,
      project_id: pid,
      proposal: {
        schema_version: 1,
        source: "operator_assistant" as const,
        proposed_at: "2026-04-20T10:00:00.000Z",
        rationale: "Rename",
        project_id: pid,
        metadata_patch: { name: "X" },
      },
      payload_error: null,
      rationale_preview: "Rename",
    };
    const rejectedRow = { ...pendingRow, review_status: "rejected" as const };

    fetchProposalsMock.mockResolvedValueOnce({ rows: [pendingRow], error: null }).mockResolvedValue({
      rows: [rejectedRow],
      error: null,
    });

    render(
      <MemoryRouter>
        <OfferBuilderProposalsReviewPage />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /Reject/i });
    const rejectButtons = screen.getAllByRole("button", { name: /^Reject$/i });
    fireEvent.click(rejectButtons[0]!);

    await waitFor(() => {
      expect(reviewOfferBuilderMock).toHaveBeenCalledWith(
        {},
        { proposalId: "p1", action: "reject" },
      );
    });
    await waitFor(() => {
      expect(fetchProposalsMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByText("No proposals awaiting review.")).toBeDefined();
    });
    expect(screen.getAllByText(/^Rename$/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/rejected/i).length).toBeGreaterThanOrEqual(1);
  });

  it("apply triggers apply RPC and refetches proposals and projects", async () => {
    const pendingRow = {
      id: "p1",
      created_at: "2026-04-20T10:00:00.000Z",
      review_status: "pending_review" as const,
      project_id: pid,
      proposal: {
        schema_version: 1,
        source: "operator_assistant" as const,
        proposed_at: "2026-04-20T10:00:00.000Z",
        rationale: "Rename",
        project_id: pid,
        metadata_patch: { name: "New", root_title: "T" },
      },
      payload_error: null,
      rationale_preview: "Rename",
    };
    const appliedRow = { ...pendingRow, review_status: "applied" as const };

    fetchProposalsMock.mockResolvedValueOnce({ rows: [pendingRow], error: null }).mockResolvedValue({
      rows: [appliedRow],
      error: null,
    });

    render(
      <MemoryRouter>
        <OfferBuilderProposalsReviewPage />
      </MemoryRouter>,
    );
    const applyButtons = await screen.findAllByTestId("apply-offer-proposal-p1");
    fireEvent.click(applyButtons[0]!);

    await waitFor(() => {
      expect(applyOfferBuilderMock).toHaveBeenCalledWith({}, { proposalId: "p1" });
    });
    await waitFor(() => {
      expect(fetchProposalsMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(listProjectsMock).toHaveBeenCalled();
    });
  });

  it("cleans up", () => {
    render(
      <MemoryRouter>
        <OfferBuilderProposalsReviewPage />
      </MemoryRouter>,
    );
    cleanup();
  });
});
