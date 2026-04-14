import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  computeDeferredNextDueAfterSweepSkip,
  runV3ThreadWorkflowDueSweep,
  V3_WORKFLOW_SWEEP_SKIP_DEFER_MS,
} from "./runV3ThreadWorkflowDueSweep.ts";

vi.mock("../operator/threadV3OperatorHold.ts", () => ({
  isThreadV3OperatorHold: vi.fn(),
}));

import { isThreadV3OperatorHold } from "../operator/threadV3OperatorHold.ts";

describe("runV3ThreadWorkflowDueSweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computeDeferredNextDueAfterSweepSkip is 1h ahead (deterministic starvation guard)", () => {
    const t = Date.parse("2026-04-06T12:00:00.000Z");
    expect(computeDeferredNextDueAfterSweepSkip(t)).toBe("2026-04-06T13:00:00.000Z");
    expect(V3_WORKFLOW_SWEEP_SKIP_DEFER_MS).toBe(3_600_000);
  });

  it("defers next_due_at when row is skipped for operator hold (no task insert)", async () => {
    vi.mocked(isThreadV3OperatorHold).mockResolvedValue(true);

    const updates: Array<Record<string, unknown>> = [];
    const sweepRow = {
      photographer_id: "p1",
      thread_id: "t-hold",
      wedding_id: null,
      workflow: { v: 1 },
      next_due_at: "2020-01-01T00:00:00.000Z",
    };
    const queryPromise = Promise.resolve({ data: [sweepRow], error: null });
    const supabase = {
      from: (table: string) => {
        if (table === "v3_thread_workflow_state") {
          return {
            select: () => ({
              lte: () => ({
                not: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => queryPromise,
                    }),
                  }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              updates.push(payload);
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ error: null }),
                }),
              };
            },
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T12:00:00.000Z"));
    try {
      const result = await runV3ThreadWorkflowDueSweep(supabase, { limit: 10 });
      expect(result.skippedHold).toBe(1);
      expect(result.tasksCreated).toBe(0);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.next_due_at).toBe("2026-04-06T13:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});
