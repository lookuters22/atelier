import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseThreadAudienceTier, type ThreadAudienceTier } from "./memoryAudienceTierPolicy.ts";

/**
 * Loads `threads.audience_tier` for reply-side memory gating. Missing thread → `client_visible` (safest).
 */
export async function fetchThreadReplyAudienceTier(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string | null | undefined,
): Promise<ThreadAudienceTier> {
  if (threadId == null || String(threadId).trim() === "") {
    return "client_visible";
  }

  const { data, error } = await supabase
    .from("threads")
    .select("audience_tier")
    .eq("photographer_id", photographerId)
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`fetchThreadReplyAudienceTier: ${error.message}`);
  }

  const row = data as { audience_tier?: string | null } | null;
  return parseThreadAudienceTier(row?.audience_tier);
}
