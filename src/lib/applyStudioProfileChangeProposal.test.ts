import { describe, expect, it, vi } from "vitest";
import { applyStudioProfileChangeProposal } from "./applyStudioProfileChangeProposal";

describe("applyStudioProfileChangeProposal", () => {
  it("calls apply_studio_profile_change_proposal_v1 with the proposal id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as never;
    const r = await applyStudioProfileChangeProposal(supabase, { proposalId: "p1" });
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("apply_studio_profile_change_proposal_v1", { p_proposal_id: "p1" });
  });

  it("maps not pending to a friendly error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "proposal not pending review" },
    });
    const supabase = { rpc } as never;
    const r = await applyStudioProfileChangeProposal(supabase, { proposalId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no longer pending review/i);
  });

  it("maps constraint-style failures to guidance", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "violates check constraint photographers_settings_base_location_shape_chk" },
    });
    const supabase = { rpc } as never;
    const r = await applyStudioProfileChangeProposal(supabase, { proposalId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/geography|constraint/i);
  });
});
