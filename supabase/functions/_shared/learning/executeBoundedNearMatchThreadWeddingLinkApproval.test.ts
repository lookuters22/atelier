import { describe, expect, it, vi } from "vitest";
import { executeBoundedNearMatchThreadWeddingLinkApproval } from "./executeBoundedNearMatchThreadWeddingLinkApproval.ts";

describe("executeBoundedNearMatchThreadWeddingLinkApproval", () => {
  it("rejects empty resolution summary", async () => {
    const supabase = { rpc: vi.fn() } as never;
    const r = await executeBoundedNearMatchThreadWeddingLinkApproval(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      resolutionSummary: "   ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RPC_FAILED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns ok when RPC status is completed", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { status: "completed", wedding_id: "w1", thread_id: "t1" },
        error: null,
      }),
    } as never;
    const r = await executeBoundedNearMatchThreadWeddingLinkApproval(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      resolutionSummary: "Linked thread to project.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.raw.status).toBe("completed");
      expect(r.raw.wedding_id).toBe("w1");
    }
    expect(supabase.rpc).toHaveBeenCalledWith("complete_bounded_near_match_thread_wedding_link", {
      p_photographer_id: "p1",
      p_escalation_id: "e1",
      p_resolution_summary: "Linked thread to project.",
    });
  });

  it("returns ok when RPC status is already_completed (idempotent replay)", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          status: "already_completed",
          closed_escalation_id: "e1",
          thread_id: "t1",
          wedding_id: "w1",
        },
        error: null,
      }),
    } as never;
    const r = await executeBoundedNearMatchThreadWeddingLinkApproval(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      resolutionSummary: "x",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.raw.status).toBe("already_completed");
  });

  it("maps thread_already_linked RPC JSON to THREAD_ALREADY_LINKED (no silent ok)", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          status: "thread_already_linked",
          thread_id: "t1",
          existing_wedding_id: "w-existing",
          attempted_wedding_id: "w-new",
          escalation_id: "e1",
        },
        error: null,
      }),
    } as never;
    const r = await executeBoundedNearMatchThreadWeddingLinkApproval(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      resolutionSummary: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("THREAD_ALREADY_LINKED");
      if (r.error.code === "THREAD_ALREADY_LINKED") {
        expect(r.error.existingWeddingId).toBe("w-existing");
        expect(r.error.attemptedWeddingId).toBe("w-new");
        expect(r.error.threadId).toBe("t1");
        expect(r.error.message).toMatch(/w-existing/);
      }
    }
  });

  it("maps malformed thread_already_linked payload to RPC_RETURNED_ERROR", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { status: "thread_already_linked", thread_id: "t1" },
        error: null,
      }),
    } as never;
    const r = await executeBoundedNearMatchThreadWeddingLinkApproval(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      resolutionSummary: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RPC_RETURNED_ERROR");
  });

  it("maps unknown status to RPC_RETURNED_ERROR", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { status: "weird" },
        error: null,
      }),
    } as never;
    const r = await executeBoundedNearMatchThreadWeddingLinkApproval(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      resolutionSummary: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("RPC_RETURNED_ERROR");
      expect(r.error.message).toMatch(/unexpected status/);
    }
  });

  it("maps PostgREST error to RPC_FAILED", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "complete_bounded_near_match_thread_wedding_link: wrong action_key" },
      }),
    } as never;
    const r = await executeBoundedNearMatchThreadWeddingLinkApproval(supabase, {
      photographerId: "p1",
      escalationId: "e1",
      resolutionSummary: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/wrong action_key/);
  });
});
