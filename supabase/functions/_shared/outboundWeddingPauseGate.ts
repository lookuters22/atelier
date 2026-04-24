import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { readWeddingAutomationPauseFreshForTenant } from "./fetchWeddingPauseFlags.ts";
import {
  logAutomationPauseObservation,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "./weddingAutomationPause.ts";

export type OutboundWeddingPauseGateResult =
  | { proceed: true; wedding_id: string | null }
  | { proceed: false; wedding_id: string; skip_reason: string };

/**
 * Client-facing Gmail/mock send must not run when the linked wedding is life-event paused,
 * even if the draft was approved before the pause flag flipped.
 */
export async function evaluateOutboundWeddingPauseGate(
  supabase: SupabaseClient,
  params: {
    draft_id: string;
    photographer_id: string;
    inngest_function_id: string;
  },
): Promise<OutboundWeddingPauseGateResult> {
  const { data: draftRow, error: dErr } = await supabase
    .from("drafts")
    .select("thread_id")
    .eq("id", params.draft_id)
    .eq("photographer_id", params.photographer_id)
    .maybeSingle();

  if (dErr) {
    throw new Error(`outbound pause gate drafts: ${dErr.message}`);
  }

  const threadId = (draftRow?.thread_id as string | null) ?? null;
  if (!threadId) {
    return { proceed: true, wedding_id: null };
  }

  const { data: threadRow, error: tErr } = await supabase
    .from("threads")
    .select("wedding_id")
    .eq("id", threadId)
    .eq("photographer_id", params.photographer_id)
    .maybeSingle();

  if (tErr) {
    throw new Error(`outbound pause gate threads: ${tErr.message}`);
  }

  const weddingId = (threadRow?.wedding_id as string | null) ?? null;
  if (!weddingId) {
    return { proceed: true, wedding_id: null };
  }

  const fresh = await readWeddingAutomationPauseFreshForTenant(
    supabase,
    weddingId,
    params.photographer_id,
  );

  if (!fresh.ok) {
    logAutomationPauseObservation({
      observation_type: "outbound_worker_skipped",
      skip_reason: fresh.reason,
      inngest_function_id: params.inngest_function_id,
      wedding_id: weddingId,
      thread_id: threadId,
      photographer_id: params.photographer_id,
      draft_id: params.draft_id,
    });
    return { proceed: false, wedding_id: weddingId, skip_reason: fresh.reason };
  }

  if (fresh.paused) {
    logAutomationPauseObservation({
      observation_type: "outbound_worker_skipped",
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
      inngest_function_id: params.inngest_function_id,
      wedding_id: weddingId,
      thread_id: threadId,
      photographer_id: params.photographer_id,
      draft_id: params.draft_id,
    });
    return {
      proceed: false,
      wedding_id: weddingId,
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
    };
  }

  return { proceed: true, wedding_id: weddingId };
}
