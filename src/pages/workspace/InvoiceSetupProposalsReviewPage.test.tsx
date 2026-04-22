// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { fetchMock, reviewMock, applyMock, fetchLiveMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  reviewMock: vi.fn(),
  applyMock: vi.fn(),
  fetchLiveMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {},
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ photographerId: "photo-1" }),
}));

vi.mock("@/lib/fetchInvoiceSetupChangeProposals", () => ({
  fetchInvoiceSetupChangeProposals: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("@/lib/reviewInvoiceSetupChangeProposal", () => ({
  reviewInvoiceSetupChangeProposal: (...args: unknown[]) => reviewMock(...args),
}));

vi.mock("@/lib/applyInvoiceSetupChangeProposal", () => ({
  applyInvoiceSetupChangeProposal: (...args: unknown[]) => applyMock(...args),
}));

vi.mock("@/lib/invoiceSetupRemote", () => ({
  fetchInvoiceSetupRemote: (...args: unknown[]) => fetchLiveMock(...args),
}));

import { defaultInvoiceSetup } from "@/lib/invoiceSetupTypes";
import { InvoiceSetupProposalsReviewPage } from "./InvoiceSetupProposalsReviewPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoiceSetupProposalsReviewPage />
    </MemoryRouter>,
  );
}

describe("InvoiceSetupProposalsReviewPage", () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({ rows: [], error: null });
    reviewMock.mockResolvedValue({ ok: true });
    applyMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("renders apply + review copy and empty queues", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId("invoice-proposals-loading")).toBeNull();
    });
    expect(screen.getByText(/apply_invoice_setup_change_proposal_v1/i)).toBeDefined();
    expect(screen.getByText(/No proposals awaiting review/i)).toBeDefined();
    expect(screen.getByText(/No closed proposals yet/i)).toBeDefined();
  });

  it("shows current vs proposed diff when live template and patch load", async () => {
    fetchMock.mockResolvedValue({
      rows: [
        {
          id: "p-diff",
          created_at: "2026-04-20T12:00:00.000Z",
          review_status: "pending_review",
          proposal: {
            schema_version: 1 as const,
            source: "operator_assistant" as const,
            proposed_at: "2026-04-20T11:00:00.000Z",
            rationale: "Rename brand.",
            template_patch: { legalName: "Proposed Name LLC" },
          },
          payload_error: null,
          rationale_preview: "Rename brand.",
        },
      ],
      error: null,
    });
    const live = { ...defaultInvoiceSetup(), legalName: "Current Legal Name" };
    fetchLiveMock.mockResolvedValue({ template: live, updatedAt: "2026-01-15T00:00:00.000Z" });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Current vs proposed \(read-only preview\)/i)).toBeDefined();
    });
    expect(screen.getByTestId("invoice-proposal-diff-p-diff")).toBeDefined();
    expect(screen.getByText("Current (live)")).toBeDefined();
    expect(screen.getByText("Proposed (apply)")).toBeDefined();
    expect(screen.getByText("Current Legal Name")).toBeDefined();
    expect(screen.getByText("Proposed Name LLC")).toBeDefined();
  });

  it("lists pending and reviewed rows from stored proposals", async () => {
    fetchMock.mockResolvedValue({
      rows: [
        {
          id: "p-pending",
          created_at: "2026-04-20T12:00:00.000Z",
          review_status: "pending_review",
          proposal: {
            schema_version: 1 as const,
            source: "operator_assistant" as const,
            proposed_at: "2026-04-20T11:00:00.000Z",
            rationale: "Short rationale for tests.",
            template_patch: { legalName: "A Studio" },
          },
          payload_error: null,
          rationale_preview: "Short rationale for tests.",
        },
        {
          id: "p-done",
          created_at: "2026-04-19T12:00:00.000Z",
          review_status: "rejected",
          proposal: {
            schema_version: 1 as const,
            source: "operator" as const,
            proposed_at: "2026-04-19T11:00:00.000Z",
            rationale: "Other",
            template_patch: { invoicePrefix: "INV" },
          },
          payload_error: null,
          rationale_preview: "Other",
        },
      ],
      error: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId("invoice-proposals-loading")).toBeNull();
    });
    const pending = screen.getByTestId("invoice-pending-proposals");
    const reviewed = screen.getByTestId("invoice-reviewed-proposals");
    expect(within(pending).getByText("p-pending")).toBeDefined();
    expect(within(reviewed).getByText("p-done")).toBeDefined();
  });

  it("shows invalid payload on a row", async () => {
    fetchMock.mockResolvedValue({
      rows: [
        {
          id: "bad",
          created_at: "2026-04-20T12:00:00.000Z",
          review_status: "pending_review",
          proposal: null,
          payload_error: "schema_version must be 1",
          rationale_preview: "—",
        },
      ],
      error: null,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Invalid payload: schema_version must be 1/i)).toBeDefined();
    });
  });

  it("rejects a pending row and refetches the queue", async () => {
    const pendingRow = {
      id: "to-reject",
      created_at: "2026-04-20T12:00:00.000Z",
      review_status: "pending_review" as const,
      proposal: {
        schema_version: 1 as const,
        source: "operator_assistant" as const,
        proposed_at: "2026-04-20T11:00:00.000Z",
        rationale: "x",
        template_patch: { legalName: "A Studio" },
      },
      payload_error: null,
      rationale_preview: "x",
    };
    const afterReject = {
      ...pendingRow,
      review_status: "rejected" as const,
    };
    fetchMock
      .mockResolvedValueOnce({ rows: [pendingRow], error: null })
      .mockResolvedValueOnce({ rows: [afterReject], error: null });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("invoice-proposal-reject-to-reject")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("invoice-proposal-reject-to-reject"));
    await waitFor(() => {
      expect(reviewMock).toHaveBeenCalledWith(expect.anything(), {
        proposalId: "to-reject",
        action: "reject",
      });
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const reviewed = screen.getByTestId("invoice-reviewed-proposals");
    expect(within(reviewed).getByText("to-reject")).toBeDefined();
  });

  it("applies a pending row and refetches the queue", async () => {
    const pendingRow = {
      id: "to-apply",
      created_at: "2026-04-20T12:00:00.000Z",
      review_status: "pending_review" as const,
      proposal: {
        schema_version: 1 as const,
        source: "operator_assistant" as const,
        proposed_at: "2026-04-20T11:00:00.000Z",
        rationale: "x",
        template_patch: { legalName: "New Legal" },
      },
      payload_error: null,
      rationale_preview: "x",
    };
    const afterApply = { ...pendingRow, review_status: "applied" as const };
    fetchMock
      .mockResolvedValueOnce({ rows: [pendingRow], error: null })
      .mockResolvedValueOnce({ rows: [afterApply], error: null });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("apply-invoice-proposal-to-apply")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("apply-invoice-proposal-to-apply"));
    await waitFor(() => {
      expect(applyMock).toHaveBeenCalledWith(expect.anything(), { proposalId: "to-apply" });
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
