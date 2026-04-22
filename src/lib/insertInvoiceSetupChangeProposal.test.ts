import { describe, expect, it, vi } from "vitest";
import { insertInvoiceSetupChangeProposal } from "./insertInvoiceSetupChangeProposal";

describe("insertInvoiceSetupChangeProposal", () => {
  it("inserts validated payload and returns id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "prop-1" }, error: null });
    const insert = vi.fn().mockReturnValue({ select: () => ({ maybeSingle }) });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as never;

    const r = await insertInvoiceSetupChangeProposal(supabase, "photo-1", {
      schema_version: 1,
      source: "operator_assistant",
      proposed_at: "2026-04-22T12:00:00.000Z",
      rationale: "x",
      template_patch: { invoicePrefix: "Z" },
    });

    expect(r.error).toBeNull();
    expect(r.id).toBe("prop-1");
    expect(from).toHaveBeenCalledWith("invoice_setup_change_proposals");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        photographer_id: "photo-1",
        review_status: "pending_review",
      }),
    );
  });

  it("returns validation error without calling insert", async () => {
    const from = vi.fn();
    const supabase = { from } as never;
    const r = await insertInvoiceSetupChangeProposal(supabase, "photo-1", { invalid: true });
    expect(r.id).toBeNull();
    expect(r.error).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });
});
