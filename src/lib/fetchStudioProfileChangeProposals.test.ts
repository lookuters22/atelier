import { describe, expect, it, vi } from "vitest";
import { fetchStudioProfileChangeProposals } from "./fetchStudioProfileChangeProposals";

describe("fetchStudioProfileChangeProposals", () => {
  it("maps rows and parses valid payload", async () => {
    const validPayload = {
      schema_version: 1,
      source: "operator",
      proposed_at: "2026-01-20T10:00:00.000Z",
      rationale: "Test proposal rationale text here",
      settings_patch: { currency: "GBP" },
    };
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "p1",
                created_at: "2026-01-20T12:00:00.000Z",
                review_status: "pending_review",
                proposal_payload: validPayload,
              },
            ],
            error: null,
          }),
        })),
      })),
    } as never;

    const { rows, error } = await fetchStudioProfileChangeProposals(supabase);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.proposal?.rationale).toBe("Test proposal rationale text here");
    expect(rows[0]!.review_status).toBe("pending_review");
    expect(rows[0]!.payload_error).toBeNull();
  });

  it("surfaces parse errors for bad payload", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "bad",
                created_at: "2026-01-20T12:00:00.000Z",
                review_status: "pending_review",
                proposal_payload: { schema_version: 2 },
              },
            ],
            error: null,
          }),
        })),
      })),
    } as never;

    const { rows, error } = await fetchStudioProfileChangeProposals(supabase);
    expect(error).toBeNull();
    expect(rows[0]!.proposal).toBeNull();
    expect(rows[0]!.payload_error).toBeDefined();
  });
});
