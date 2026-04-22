import { describe, expect, it, vi } from "vitest";
import { reviewOfferBuilderChangeProposal } from "./reviewOfferBuilderChangeProposal";

describe("reviewOfferBuilderChangeProposal", () => {
  it("calls rpc with rejected for reject action", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { rpc } as never;
    const out = await reviewOfferBuilderChangeProposal(supabase, { proposalId: "p1", action: "reject" });
    expect(out.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("review_offer_builder_change_proposal", {
      p_proposal_id: "p1",
      p_next_status: "rejected",
    });
  });

  it("calls rpc with withdrawn for withdraw action", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { rpc } as never;
    await reviewOfferBuilderChangeProposal(supabase, { proposalId: "p2", action: "withdraw" });
    expect(rpc).toHaveBeenCalledWith("review_offer_builder_change_proposal", {
      p_proposal_id: "p2",
      p_next_status: "withdrawn",
    });
  });

  it("maps forbidden error to friendly message", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ error: { message: "forbidden" } }),
    } as never;
    const out = await reviewOfferBuilderChangeProposal(supabase, { proposalId: "x", action: "reject" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("cannot update");
    }
  });
});
