import { describe, expect, it, vi } from "vitest";
import { applyInvoiceSetupChangeProposal } from "./applyInvoiceSetupChangeProposal";

describe("applyInvoiceSetupChangeProposal", () => {
  it("calls apply_invoice_setup_change_proposal_v1 with the proposal id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as never;
    const r = await applyInvoiceSetupChangeProposal(supabase, { proposalId: "p1" });
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("apply_invoice_setup_change_proposal_v1", { p_proposal_id: "p1" });
  });

  it("maps not pending to a friendly error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "proposal not pending review" },
    });
    const supabase = { rpc } as never;
    const r = await applyInvoiceSetupChangeProposal(supabase, { proposalId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no longer pending review/i);
  });

  it("maps invoice setup update failure to a friendly error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "invoice setup not updated" },
    });
    const supabase = { rpc } as never;
    const r = await applyInvoiceSetupChangeProposal(supabase, { proposalId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Could not update the live invoice template/i);
  });
});
