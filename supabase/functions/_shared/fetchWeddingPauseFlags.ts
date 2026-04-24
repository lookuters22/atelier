import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  isWeddingAutomationPaused,
  type WeddingAutomationPauseInput,
} from "./weddingAutomationPause.ts";

/** Supabase returned an error — do not treat as "not paused". */
export const WEDDING_PAUSE_STATE_DB_ERROR = "wedding_pause_state_db_error" as const;

/** No row for tenant-scoped wedding id — pause flags cannot be confirmed. */
export const WEDDING_PAUSE_STATE_UNREADABLE = "wedding_pause_state_unreadable" as const;

export type WeddingAutomationPauseFreshReadResult =
  | { ok: true; paused: boolean }
  | {
      ok: false;
      reason: typeof WEDDING_PAUSE_STATE_DB_ERROR | typeof WEDDING_PAUSE_STATE_UNREADABLE;
    };

/**
 * Re-read `weddings` pause flags after Inngest step boundaries or long-running model work.
 * Fail-closed: DB errors and missing rows yield `ok: false` (callers must skip client-facing automation).
 */
export async function readWeddingAutomationPauseFreshForTenant(
  supabase: SupabaseClient,
  weddingId: string,
  photographerId: string,
): Promise<WeddingAutomationPauseFreshReadResult> {
  const { data, error } = await supabase
    .from("weddings")
    .select("compassion_pause, strategic_pause")
    .eq("id", weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: WEDDING_PAUSE_STATE_DB_ERROR };
  }
  if (!data) {
    return { ok: false, reason: WEDDING_PAUSE_STATE_UNREADABLE };
  }

  return {
    ok: true,
    paused: isWeddingAutomationPaused(data as WeddingAutomationPauseInput),
  };
}
