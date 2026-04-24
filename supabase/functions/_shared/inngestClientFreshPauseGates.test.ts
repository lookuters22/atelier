import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEDDING_PAUSE_STATE_DB_ERROR, WEDDING_PAUSE_STATE_UNREADABLE } from "./fetchWeddingPauseFlags.ts";
import {
  evaluatePersonaSaveDraftFreshPauseGate,
  evaluateRewriteDraftUpdatePauseGate,
  evaluateWhatsAppSaveDraftFreshPauseGate,
} from "./inngestClientFreshPauseGates.ts";
import { WEDDING_AUTOMATION_PAUSED_SKIP_REASON } from "./weddingAutomationPause.ts";

function weddingsChainMaybeSingle(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("evaluateWhatsAppSaveDraftFreshPauseGate", () => {
  it("allows insert when there is no wedding id", async () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(
      evaluateWhatsAppSaveDraftFreshPauseGate(supabase, {
        weddingId: null,
        photographerId: "p1",
        threadId: "t1",
      }),
    ).resolves.toEqual({ allowDraftInsert: true });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("blocks with wedding_pause_state_unreadable when row is missing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const weddings = weddingsChainMaybeSingle({ data: null, error: null });
    const supabase = {
      from: vi.fn((t: string) => {
        if (t === "weddings") return weddings;
        throw new Error(t);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateWhatsAppSaveDraftFreshPauseGate(supabase, {
        weddingId: "w1",
        photographerId: "p1",
        threadId: "t1",
      }),
    ).resolves.toEqual({ allowDraftInsert: false, skip_reason: WEDDING_PAUSE_STATE_UNREADABLE });
  });

  it("blocks with wedding_automation_paused when strategic_pause is true", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const weddings = weddingsChainMaybeSingle({
      data: { compassion_pause: false, strategic_pause: true },
      error: null,
    });
    const supabase = {
      from: vi.fn((t: string) => {
        if (t === "weddings") return weddings;
        throw new Error(t);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateWhatsAppSaveDraftFreshPauseGate(supabase, {
        weddingId: "w1",
        photographerId: "p1",
        threadId: "t1",
      }),
    ).resolves.toEqual({
      allowDraftInsert: false,
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
    });
  });
});

describe("evaluatePersonaSaveDraftFreshPauseGate", () => {
  it("proceeds when wedding_id is missing", async () => {
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(
      evaluatePersonaSaveDraftFreshPauseGate(supabase, {
        wedding_id: null,
        photographer_id: "p1",
        thread_id: "t1",
      }),
    ).resolves.toEqual({ proceed: true });
  });

  it("blocks with wedding_pause_state_unreadable when row is missing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const weddings = weddingsChainMaybeSingle({ data: null, error: null });
    const supabase = {
      from: vi.fn((t: string) => {
        if (t === "weddings") return weddings;
        throw new Error(t);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluatePersonaSaveDraftFreshPauseGate(supabase, {
        wedding_id: "w1",
        photographer_id: "p1",
        thread_id: "t1",
      }),
    ).resolves.toEqual({ proceed: false, skip_reason: WEDDING_PAUSE_STATE_UNREADABLE });
  });
});

describe("evaluateRewriteDraftUpdatePauseGate", () => {
  it("blocks with wedding_pause_state_db_error when Supabase errors", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const weddings = weddingsChainMaybeSingle({ data: null, error: { message: "timeout" } });
    const supabase = {
      from: vi.fn((t: string) => {
        if (t === "weddings") return weddings;
        throw new Error(t);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateRewriteDraftUpdatePauseGate(supabase, {
        weddingId: "w1",
        photographerId: "p1",
        draftId: "d1",
        threadId: "t1",
      }),
    ).resolves.toEqual({ allowUpdate: false, skip_reason: WEDDING_PAUSE_STATE_DB_ERROR });
  });

  it("allows update when row is readable and not paused", async () => {
    const weddings = weddingsChainMaybeSingle({
      data: { compassion_pause: false, strategic_pause: false },
      error: null,
    });
    const supabase = {
      from: vi.fn((t: string) => {
        if (t === "weddings") return weddings;
        throw new Error(t);
      }),
    } as unknown as SupabaseClient;

    await expect(
      evaluateRewriteDraftUpdatePauseGate(supabase, {
        weddingId: "w1",
        photographerId: "p1",
        draftId: "d1",
        threadId: "t1",
      }),
    ).resolves.toEqual({ allowUpdate: true });
  });
});
