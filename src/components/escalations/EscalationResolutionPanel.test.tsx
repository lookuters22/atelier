// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { EscalationResolutionPanel } from "./EscalationResolutionPanel";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock("../../lib/escalationResolutionClient", () => ({
  resolveEscalationViaDashboard: vi.fn().mockResolvedValue({ queued: true, jobId: "job-1" }),
}));

describe("EscalationResolutionPanel", () => {
  afterEach(() => {
    cleanup();
    fromMock.mockReset();
  });

  it("shows Link thread to project for bounded near-match escalations", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "escalation_requests") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  question_body: "Approve filing?",
                  action_key: "request_thread_wedding_link",
                  reason_code: "bounded_matchmaker_near_match",
                  decision_justification: {
                    candidate_wedding_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                    confidence_score: 81,
                    matchmaker_reasoning: "Venue overlap with booked project.",
                  },
                  status: "open",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "escalation_resolution_jobs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    render(<EscalationResolutionPanel escalationId="esc-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Suggested project link/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /Link thread to project/i })).toBeTruthy();
    expect(screen.getByText(/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/)).toBeTruthy();
    expect(screen.getByText(/81/)).toBeTruthy();
  });
});
