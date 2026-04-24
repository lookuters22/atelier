import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { WEDDING_PAUSE_STATE_DB_ERROR } from "../fetchWeddingPauseFlags.ts";
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

  it("defers next_due_at when wedding has compassion_pause (no task insert)", async () => {
    vi.mocked(isThreadV3OperatorHold).mockResolvedValue(false);

    const updates: Array<Record<string, unknown>> = [];
    const sweepRow = {
      photographer_id: "p1",
      thread_id: "t-paused",
      wedding_id: "w-paused",
      workflow: { v: 1 },
      next_due_at: "2020-01-01T00:00:00.000Z",
    };

    const supabase = {
      from: (table: string) => {
        if (table === "v3_thread_workflow_state") {
          return {
            select: () => ({
              lte: () => ({
                not: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [sweepRow], error: null }),
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
        if (table === "weddings") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        compassion_pause: true,
                        strategic_pause: false,
                        agency_cc_lock: false,
                      },
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T12:00:00.000Z"));
    try {
      const result = await runV3ThreadWorkflowDueSweep(supabase, { limit: 10 });
      expect(result.skippedPaused).toBe(1);
      expect(result.tasksCreated).toBe(0);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.next_due_at).toBe("2026-04-06T13:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("defers sweep row when weddings pause read errors (fail closed; no task insert)", async () => {
    vi.mocked(isThreadV3OperatorHold).mockResolvedValue(false);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const updates: Array<Record<string, unknown>> = [];
    const sweepRow = {
      photographer_id: "p1",
      thread_id: "t-db",
      wedding_id: "w-db",
      workflow: { v: 1 },
      next_due_at: "2020-01-01T00:00:00.000Z",
    };

    const supabase = {
      from: (table: string) => {
        if (table === "v3_thread_workflow_state") {
          return {
            select: () => ({
              lte: () => ({
                not: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [sweepRow], error: null }),
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
        if (table === "weddings") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: null,
                      error: { message: "pause read failed" },
                    }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T12:00:00.000Z"));
    try {
      const result = await runV3ThreadWorkflowDueSweep(supabase, { limit: 10 });
      expect(result.skippedPaused).toBe(1);
      expect(result.tasksCreated).toBe(0);
      expect(updates).toHaveLength(1);
      expect(updates[0]?.next_due_at).toBe("2026-04-06T13:00:00.000Z");
      const logCalls = vi.mocked(console.log).mock.calls.map((c) => String(c[0] ?? ""));
      expect(logCalls.some((line) => line.includes(WEDDING_PAUSE_STATE_DB_ERROR))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates task when readiness milestone is overdue (questionnaire pending + past due_at)", async () => {
    vi.mocked(isThreadV3OperatorHold).mockResolvedValue(false);

    const taskRows: Array<{ title?: string }> = [];
    const workflowUpdates: Array<{ workflow?: Record<string, unknown> }> = [];

    const sweepRow = {
      photographer_id: "p1",
      thread_id: "t-ready",
      wedding_id: null as string | null,
      workflow: {
        v: 1,
        readiness: {
          questionnaire: { status: "pending", due_at: "2020-01-01T00:00:00.000Z" },
        },
      },
      next_due_at: "2020-01-01T00:00:00.000Z",
    };

    const supabase = {
      from: (table: string) => {
        if (table === "v3_thread_workflow_state") {
          return {
            select: () => ({
              lte: () => ({
                not: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [sweepRow], error: null }),
                    }),
                  }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              workflowUpdates.push(payload as { workflow?: Record<string, unknown> });
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "tasks") {
          return {
            insert: (row: { title?: string }) => {
              taskRows.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
    try {
      const result = await runV3ThreadWorkflowDueSweep(supabase, { limit: 10 });
      expect(result.processed).toBe(1);
      expect(result.tasksCreated).toBe(1);
      expect(taskRows).toHaveLength(1);
      expect(taskRows[0]?.title).toMatch(/questionnaire/i);
      const wfPayload = workflowUpdates.find((u) => u.workflow != null)?.workflow as {
        readiness?: { questionnaire?: { overdue_nudge_task_created_at?: string } };
      };
      expect(wfPayload?.readiness?.questionnaire?.overdue_nudge_task_created_at).toMatch(
        /2026-04-10T12:00:00\.000Z/,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
