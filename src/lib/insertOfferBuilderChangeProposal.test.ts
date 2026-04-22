import { describe, expect, it, vi } from "vitest";
import { insertOfferBuilderChangeProposal } from "./insertOfferBuilderChangeProposal";

const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";
const valid = {
  schema_version: 1,
  source: "operator" as const,
  proposed_at: "2026-01-20T10:00:00.000Z",
  rationale: "Queue test",
  project_id: pid,
  metadata_patch: { name: "Luxury Weddings" },
};

describe("insertOfferBuilderChangeProposal", () => {
  it("rejects invalid body before insert", async () => {
    const supabase = { from: vi.fn() } as never;
    const out = await insertOfferBuilderChangeProposal(supabase, "u1", { schema_version: 99 });
    expect(out.id).toBeNull();
    expect(out.error).toBeDefined();
  });

  it("inserts when valid and returns id", async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null }),
          })),
        })),
      })),
    } as never;

    const out = await insertOfferBuilderChangeProposal(supabase, "u1", valid);
    expect(out.error).toBeNull();
    expect(out.id).toBe("new-id");
  });
});
