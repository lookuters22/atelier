import { describe, expect, it, vi } from "vitest";
import { applyOfferBuilderChangeProposal } from "./applyOfferBuilderChangeProposal";

describe("applyOfferBuilderChangeProposal", () => {
  it("calls apply_offer_builder_change_proposal_v1 with the proposal id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as never;
    const r = await applyOfferBuilderChangeProposal(supabase, { proposalId: "p1" });
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("apply_offer_builder_change_proposal_v1", { p_proposal_id: "p1" });
  });

  it("maps not pending to a friendly error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "proposal not pending review" },
    });
    const supabase = { rpc } as never;
    const r = await applyOfferBuilderChangeProposal(supabase, { proposalId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no longer pending review/i);
  });

  it("maps project missing to a friendly error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "offer project not found or not updated" },
    });
    const supabase = { rpc } as never;
    const r = await applyOfferBuilderChangeProposal(supabase, { proposalId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Could not update the live offer project/i);
  });
});
