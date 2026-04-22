import { describe, expect, it, vi } from "vitest";
import { insertStudioProfileChangeProposal } from "./insertStudioProfileChangeProposal";

const valid = {
  schema_version: 1,
  source: "operator" as const,
  proposed_at: "2026-01-20T10:00:00.000Z",
  rationale: "Queue test",
  settings_patch: { studio_name: "X" },
};

describe("insertStudioProfileChangeProposal", () => {
  it("rejects invalid body before insert", async () => {
    const supabase = { from: vi.fn() } as never;
    const out = await insertStudioProfileChangeProposal(supabase, "u1", { schema_version: 99 });
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

    const out = await insertStudioProfileChangeProposal(supabase, "u1", valid);
    expect(out.error).toBeNull();
    expect(out.id).toBe("new-id");
  });
});
