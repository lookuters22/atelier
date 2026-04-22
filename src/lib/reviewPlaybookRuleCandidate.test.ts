import { describe, expect, it, vi } from "vitest";
import { reviewPlaybookRuleCandidate } from "./reviewPlaybookRuleCandidate";
import { FunctionsHttpError } from "@supabase/supabase-js";

describe("reviewPlaybookRuleCandidate", () => {
  it("returns receipt on success", async () => {
    const receipt = {
      action: "reject" as const,
      candidate_id: "550e8400-e29b-41d4-a716-446655440000",
      review_status: "rejected" as const,
    };
    const supabase = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { ok: true, receipt },
          error: null,
        }),
      },
    } as never;

    const out = await reviewPlaybookRuleCandidate(supabase, {
      candidateId: "550e8400-e29b-41d4-a716-446655440000",
      action: "reject",
    });
    expect(out.error).toBeNull();
    expect(out.receipt).toEqual(receipt);
    expect(supabase.functions.invoke).toHaveBeenCalledWith("review-playbook-rule-candidate", {
      body: {
        candidate_id: "550e8400-e29b-41d4-a716-446655440000",
        action: "reject",
      },
    });
  });

  it("returns error message from invoke failure body", async () => {
    const supabase = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { error: "Candidate is not pending review" },
          error: new Error("non-2xx"),
        }),
      },
    } as never;

    const out = await reviewPlaybookRuleCandidate(supabase, {
      candidateId: "550e8400-e29b-41d4-a716-446655440000",
      action: "approve",
    });
    expect(out.receipt).toBeNull();
    expect(out.error).toBe("Candidate is not pending review");
  });

  it("reads error from FunctionsHttpError JSON body", async () => {
    const ctx = { json: async () => ({ error: "Forbidden" }) };
    const err = new FunctionsHttpError("ctx");
    (err as { context: unknown }).context = ctx;
    const supabase = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: err }),
      },
    } as never;

    const out = await reviewPlaybookRuleCandidate(supabase, {
      candidateId: "550e8400-e29b-41d4-a716-446655440000",
      action: "approve",
    });
    expect(out.receipt).toBeNull();
    expect(out.error).toBe("Forbidden");
  });
});
