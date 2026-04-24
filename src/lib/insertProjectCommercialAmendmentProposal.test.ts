import { describe, expect, it, vi } from "vitest";
import { insertProjectCommercialAmendmentProposal } from "./insertProjectCommercialAmendmentProposal.ts";

describe("insertProjectCommercialAmendmentProposal", () => {
  it("inserts validated payload with wedding_id and thread_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "amd-1" }, error: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ maybeSingle }) });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const wid = "e0eebc99-9c0b-4ef8-8bb6-555555555555";
    const tid = "f0eebc99-9c0b-4ef8-8bb6-666666666666";

    const r = await insertProjectCommercialAmendmentProposal(supabase, "photo-1", {
      schema_version: 1,
      source: "operator_assistant",
      proposed_at: "2026-04-23T12:00:00.000Z",
      rationale: "Payment plan adjusted",
      wedding_id: wid,
      client_thread_id: tid,
      change_categories: ["payment_schedule"],
      deltas: { payment_schedule: { summary: "50/50 split instead of 40/60" } },
    });

    expect(r.error).toBeNull();
    expect(r.id).toBe("amd-1");
    expect(from).toHaveBeenCalledWith("project_commercial_amendment_proposals");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        photographer_id: "photo-1",
        wedding_id: wid,
        thread_id: tid,
        review_status: "pending_review",
      }),
    );
  });

  it("returns validation error without calling insert", async () => {
    const from = vi.fn();
    const supabase = { from } as never;
    const r = await insertProjectCommercialAmendmentProposal(supabase, "photo-1", { invalid: true });
    expect(r.id).toBeNull();
    expect(r.error).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });
});
