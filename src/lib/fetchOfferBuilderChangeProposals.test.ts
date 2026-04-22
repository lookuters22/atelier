import { describe, expect, it, vi } from "vitest";
import { fetchOfferBuilderChangeProposals } from "./fetchOfferBuilderChangeProposals";

const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";
const basePayload = {
  schema_version: 1,
  source: "operator_assistant" as const,
  proposed_at: "2026-01-20T10:00:00.000Z",
  rationale: "Rename the premium offer list label for clarity in the hub.",
  project_id: pid,
  metadata_patch: { name: "Luxury Weddings" },
};

describe("fetchOfferBuilderChangeProposals", () => {
  it("returns parsed rows and rationale preview", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "prop-1",
                created_at: "2026-04-20T12:00:00.000Z",
                review_status: "pending_review",
                project_id: pid,
                proposal_payload: basePayload,
              },
            ],
            error: null,
          }),
        })),
      })),
    } as never;

    const { rows, error } = await fetchOfferBuilderChangeProposals(supabase);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.review_status).toBe("pending_review");
    expect(rows[0]!.project_id).toBe(pid);
    expect(rows[0]!.proposal).not.toBeNull();
    expect(rows[0]!.proposal!.metadata_patch.name).toBe("Luxury Weddings");
    expect(rows[0]!.rationale_preview.length).toBeLessThanOrEqual(120);
    expect(rows[0]!.payload_error).toBeNull();
  });

  it("surfaces payload_error when json fails validation", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "bad",
                created_at: "2026-04-20T12:00:00.000Z",
                review_status: "pending_review",
                project_id: pid,
                proposal_payload: { schema_version: 99 },
              },
            ],
            error: null,
          }),
        })),
      })),
    } as never;

    const { rows, error } = await fetchOfferBuilderChangeProposals(supabase);
    expect(error).toBeNull();
    expect(rows[0]!.proposal).toBeNull();
    expect(rows[0]!.payload_error).toBeTruthy();
  });

  it("returns error string when supabase select fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "nope" } }),
        })),
      })),
    } as never;

    const { rows, error } = await fetchOfferBuilderChangeProposals(supabase);
    expect(rows).toEqual([]);
    expect(error).toBe("nope");
  });
});
