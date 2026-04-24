/**
 * Stress-test-shaped proofs for REAL_CONVERSATION_STRESS_TEST_PLAN.md automation pause propagation.
 * Maps: ST1 wire follow-up, ST2 emergency/strategic pause, ST6 compassion pause, ST8 stalled nudge.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateOutboundWeddingPauseGate } from "./outboundWeddingPauseGate.ts";
import { attemptOrchestratorDraft } from "./orchestrator/attemptOrchestratorDraft.ts";
import { WEDDING_AUTOMATION_PAUSED_SKIP_REASON } from "./weddingAutomationPause.ts";
import { isThreadV3OperatorHold } from "./operator/threadV3OperatorHold.ts";
import { runV3ThreadWorkflowDueSweep } from "./workflow/runV3ThreadWorkflowDueSweep.ts";

vi.mock("./operator/threadV3OperatorHold.ts", () => ({
  isThreadV3OperatorHold: vi.fn(),
}));

function outboundChains(data: unknown, error: { message: string } | null = null) {
  const end = { maybeSingle: vi.fn(async () => ({ data, error })) };
  const eq2 = { eq: vi.fn(() => end) };
  const eq1 = { eq: vi.fn(() => eq2) };
  return { select: vi.fn(() => eq1) };
}

describe("stress-shaped pause propagation (real thread / automation plan)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ST2: outbound send gate blocks when strategic_pause is true (emergency-style pause)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const drafts = outboundChains({ thread_id: "t1" });
    const threads = outboundChains({ wedding_id: "w1" });
    const weddings = outboundChains({
      compassion_pause: false,
      strategic_pause: true,
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "threads") return threads;
        if (table === "weddings") return weddings;
        throw new Error(table);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateOutboundWeddingPauseGate(supabase, {
        draft_id: "d1",
        photographer_id: "p1",
        inngest_function_id: "outbound-proof",
      }),
    ).resolves.toEqual({
      proceed: false,
      wedding_id: "w1",
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
    });
  });

  it("ST1 + ST8: workflow sweep does not create wire or stalled tasks when compassion_pause is on", async () => {
    vi.mocked(isThreadV3OperatorHold).mockResolvedValue(false);

    const taskInserts: Array<Record<string, unknown>> = [];
    const sweepRow = {
      photographer_id: "p1",
      thread_id: "t-stress",
      wedding_id: "w-paused",
      workflow: {
        v: 1,
        payment_wire: { chase_due_at: "2020-01-01T00:00:00.000Z" },
        stalled_inquiry: { nudge_due_at: "2020-01-01T00:00:00.000Z" },
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
            update: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }),
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
        if (table === "tasks") {
          return {
            insert: (row: Record<string, unknown>) => {
              taskInserts.push(row);
              return Promise.resolve({ error: null });
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
      expect(result.skippedPaused).toBe(1);
      expect(result.tasksCreated).toBe(0);
      expect(taskInserts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ST6: orchestrator draft insert skipped when fresh weddings shows compassion_pause", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const insert = vi.fn();
    const supabase = {
      from: (table: string) => {
        if (table === "drafts") return { insert };
        if (table === "threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { wedding_id: "w-compassion" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "weddings") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { compassion_pause: true, strategic_pause: false },
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

    const result = await attemptOrchestratorDraft(supabase, {
      photographerId: "p1",
      threadId: "t1",
      proposedActions: [
        {
          id: "c1",
          action_family: "send_message",
          action_key: "send_message",
          rationale: "x",
          verifier_gating_required: true,
          likely_outcome: "draft",
          blockers_or_missing_facts: [],
        },
      ],
      verifierSuccess: true,
      orchestratorOutcome: "draft",
      rawMessage: "hello",
      replyChannel: "email",
      playbookRules: [],
      crmSnapshotForPause: { compassion_pause: false, strategic_pause: false },
    });

    expect(result.draftCreated).toBe(false);
    expect(result.skipReason).toBe(WEDDING_AUTOMATION_PAUSED_SKIP_REASON);
    expect(insert).not.toHaveBeenCalled();
  });
});
