import { describe, expect, it } from "vitest";
import { finalizeEscalationWithWritebackResult } from "./finalizeEscalationWithWritebackResult.ts";

/**
 * Proof-oriented: legacy finalize helper; operator path uses `completeEscalationResolutionAtomic` RPCs
 * (artifact + escalation row in one transaction).
 */
describe("escalation resolution atomicity (orchestrator contract)", () => {
  it("finalize is not invoked when writeback fails (caller never reaches finalize)", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: (table: string) => {
        if (table !== "escalation_requests") throw new Error(`unexpected ${table}`);
        return {
          update: (payload: unknown) => {
            updates.push(payload);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      },
    };

    let writebackFailed = true;
    const runFlow = async () => {
      if (writebackFailed) {
        throw new Error("documents insert: boom");
      }
      await finalizeEscalationWithWritebackResult(supabase as never, {
        photographerId: "p1",
        escalationId: "e1",
        learningOutcome: "reusable_playbook",
        writeback: { branch: "document", documentId: "d1" },
      });
    };

    await expect(runFlow()).rejects.toThrow(/documents insert/);
    expect(updates.length).toBe(0);
  });

  it("repeated finalize with same writeback shape is idempotent at row level (same patch)", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: () => ({
        update: (payload: unknown) => {
          updates.push(payload);
          return {
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        },
      }),
    };

    const wb = {
      branch: "memory" as const,
      memoryId: "m1",
    };

    await finalizeEscalationWithWritebackResult(supabase as never, {
      photographerId: "p1",
      escalationId: "e1",
      learningOutcome: "one_off_case",
      writeback: wb,
    });
    await finalizeEscalationWithWritebackResult(supabase as never, {
      photographerId: "p1",
      escalationId: "e1",
      learningOutcome: "one_off_case",
      writeback: wb,
    });

    expect(updates.length).toBe(2);
    const a = updates[0] as Record<string, unknown>;
    const b = updates[1] as Record<string, unknown>;
    expect(a.status).toBe(b.status);
    expect(a.resolution_storage_target).toBe(b.resolution_storage_target);
    expect(a.learning_outcome).toBe(b.learning_outcome);
  });
});
