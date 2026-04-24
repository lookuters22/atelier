import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { describe, expect, it, vi, afterEach } from "vitest";
import { WEDDING_PAUSE_STATE_UNREADABLE } from "./fetchWeddingPauseFlags.ts";
import { evaluateOutboundWeddingPauseGate } from "./outboundWeddingPauseGate.ts";
import { WEDDING_AUTOMATION_PAUSED_SKIP_REASON } from "./weddingAutomationPause.ts";

function chainEndingMaybeSingle(data: unknown, error: { message: string } | null = null) {
  const end = {
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  const eq2 = {
    eq: vi.fn(() => end),
  };
  const eq1 = {
    eq: vi.fn(() => eq2),
  };
  return {
    select: vi.fn(() => eq1),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("evaluateOutboundWeddingPauseGate", () => {
  it("proceeds when draft has no thread id", async () => {
    const drafts = chainEndingMaybeSingle({ thread_id: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateOutboundWeddingPauseGate(supabase, {
        draft_id: "d1",
        photographer_id: "p1",
        inngest_function_id: "outbound-worker",
      }),
    ).resolves.toEqual({ proceed: true, wedding_id: null });
  });

  it("proceeds when thread has no wedding", async () => {
    const drafts = chainEndingMaybeSingle({ thread_id: "t1" });
    const threads = chainEndingMaybeSingle({ wedding_id: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "threads") return threads;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateOutboundWeddingPauseGate(supabase, {
        draft_id: "d1",
        photographer_id: "p1",
        inngest_function_id: "outbound-worker",
      }),
    ).resolves.toEqual({ proceed: true, wedding_id: null });
  });

  it("proceeds when wedding is not paused", async () => {
    const drafts = chainEndingMaybeSingle({ thread_id: "t1" });
    const threads = chainEndingMaybeSingle({ wedding_id: "w1" });
    const weddings = chainEndingMaybeSingle({
      compassion_pause: false,
      strategic_pause: false,
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "threads") return threads;
        if (table === "weddings") return weddings;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateOutboundWeddingPauseGate(supabase, {
        draft_id: "d1",
        photographer_id: "p1",
        inngest_function_id: "outbound-worker",
      }),
    ).resolves.toEqual({ proceed: true, wedding_id: "w1" });
  });

  it("returns proceed false when wedding has compassion_pause", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const drafts = chainEndingMaybeSingle({ thread_id: "t1" });
    const threads = chainEndingMaybeSingle({ wedding_id: "w1" });
    const weddings = chainEndingMaybeSingle({
      compassion_pause: true,
      strategic_pause: false,
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "threads") return threads;
        if (table === "weddings") return weddings;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateOutboundWeddingPauseGate(supabase, {
        draft_id: "d1",
        photographer_id: "p1",
        inngest_function_id: "outbound-worker",
      }),
    ).resolves.toEqual({
      proceed: false,
      wedding_id: "w1",
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
    });
  });

  it("returns proceed false when wedding row is missing (fail-closed)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const drafts = chainEndingMaybeSingle({ thread_id: "t1" });
    const threads = chainEndingMaybeSingle({ wedding_id: "w1" });
    const weddings = chainEndingMaybeSingle(null);
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "drafts") return drafts;
        if (table === "threads") return threads;
        if (table === "weddings") return weddings;
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateOutboundWeddingPauseGate(supabase, {
        draft_id: "d1",
        photographer_id: "p1",
        inngest_function_id: "outbound-worker",
      }),
    ).resolves.toEqual({
      proceed: false,
      wedding_id: "w1",
      skip_reason: WEDDING_PAUSE_STATE_UNREADABLE,
    });
  });
});
