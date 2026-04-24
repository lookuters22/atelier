import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { describe, expect, it, vi } from "vitest";
import {
  readWeddingAutomationPauseFreshForTenant,
  WEDDING_PAUSE_STATE_DB_ERROR,
  WEDDING_PAUSE_STATE_UNREADABLE,
} from "./fetchWeddingPauseFlags.ts";

function mockSupabaseForWeddingRow(
  row: { compassion_pause?: boolean | null; strategic_pause?: boolean | null } | null,
  err: { message: string } | null = null,
): SupabaseClient {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: row, error: err })),
  };
  return { from: vi.fn(() => chain) } as unknown as SupabaseClient;
}

describe("readWeddingAutomationPauseFreshForTenant", () => {
  it("returns ok:false unreadable when row is missing (fail-closed)", async () => {
    const sb = mockSupabaseForWeddingRow(null);
    await expect(readWeddingAutomationPauseFreshForTenant(sb, "w1", "p1")).resolves.toEqual({
      ok: false,
      reason: WEDDING_PAUSE_STATE_UNREADABLE,
    });
  });

  it("returns ok:false db_error when Supabase returns an error (fail-closed)", async () => {
    const sb = mockSupabaseForWeddingRow(null, { message: "timeout" });
    await expect(readWeddingAutomationPauseFreshForTenant(sb, "w1", "p1")).resolves.toEqual({
      ok: false,
      reason: WEDDING_PAUSE_STATE_DB_ERROR,
    });
  });

  it("returns ok:true paused:false when both flags are false", async () => {
    const sb = mockSupabaseForWeddingRow({ compassion_pause: false, strategic_pause: false });
    await expect(readWeddingAutomationPauseFreshForTenant(sb, "w1", "p1")).resolves.toEqual({
      ok: true,
      paused: false,
    });
  });

  it("returns ok:true paused:true when compassion_pause is true", async () => {
    const sb = mockSupabaseForWeddingRow({ compassion_pause: true, strategic_pause: false });
    await expect(readWeddingAutomationPauseFreshForTenant(sb, "w1", "p1")).resolves.toEqual({
      ok: true,
      paused: true,
    });
  });
});
