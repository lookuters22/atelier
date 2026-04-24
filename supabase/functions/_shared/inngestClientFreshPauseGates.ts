import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { readWeddingAutomationPauseFreshForTenant } from "./fetchWeddingPauseFlags.ts";
import {
  logAutomationPauseObservation,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "./weddingAutomationPause.ts";

export type WhatsAppSaveDraftFreshPauseResult =
  | { allowDraftInsert: true }
  | { allowDraftInsert: false; skip_reason: string };

/**
 * Fresh pause gate before WhatsApp orchestrator `drafts` insert (fail-closed on unreadable DB/row).
 * Lives in `_shared` so Vitest can cover it without loading Deno `npm:inngest` workers.
 */
export async function evaluateWhatsAppSaveDraftFreshPauseGate(
  supabase: SupabaseClient,
  params: {
    weddingId: string | null;
    photographerId: string;
    threadId: string | null;
  },
): Promise<WhatsAppSaveDraftFreshPauseResult> {
  if (!params.weddingId) {
    return { allowDraftInsert: true };
  }

  const read = await readWeddingAutomationPauseFreshForTenant(
    supabase,
    params.weddingId,
    params.photographerId,
  );

  if (!read.ok) {
    logAutomationPauseObservation({
      observation_type: "inngest_worker_skipped",
      skip_reason: read.reason,
      inngest_function_id: "whatsapp-orchestrator-v2",
      wedding_id: params.weddingId,
      thread_id: params.threadId,
      photographer_id: params.photographerId,
      gate: "save_draft_pre_insert",
    });
    return { allowDraftInsert: false, skip_reason: read.reason };
  }

  if (read.paused) {
    logAutomationPauseObservation({
      observation_type: "inngest_worker_skipped",
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
      inngest_function_id: "whatsapp-orchestrator-v2",
      wedding_id: params.weddingId,
      thread_id: params.threadId,
      photographer_id: params.photographerId,
      gate: "save_draft_pre_insert",
    });
    return { allowDraftInsert: false, skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON };
  }

  return { allowDraftInsert: true };
}

export type PersonaSaveDraftFreshPauseGateResult =
  | { proceed: true }
  | { proceed: false; skip_reason: string };

export async function evaluatePersonaSaveDraftFreshPauseGate(
  supabase: SupabaseClient,
  params: {
    wedding_id: string | null | undefined;
    photographer_id: string | null | undefined;
    thread_id: string | null;
  },
): Promise<PersonaSaveDraftFreshPauseGateResult> {
  if (!params.wedding_id || !params.photographer_id) {
    return { proceed: true };
  }

  const read = await readWeddingAutomationPauseFreshForTenant(
    supabase,
    params.wedding_id,
    params.photographer_id,
  );

  if (!read.ok) {
    logAutomationPauseObservation({
      observation_type: "inngest_worker_skipped",
      skip_reason: read.reason,
      inngest_function_id: "persona-agent",
      wedding_id: params.wedding_id,
      thread_id: params.thread_id,
      photographer_id: params.photographer_id,
      gate: "save_draft_pre_insert",
    });
    return { proceed: false, skip_reason: read.reason };
  }

  if (read.paused) {
    logAutomationPauseObservation({
      observation_type: "inngest_worker_skipped",
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
      inngest_function_id: "persona-agent",
      wedding_id: params.wedding_id,
      thread_id: params.thread_id,
      photographer_id: params.photographer_id,
      gate: "save_draft_pre_insert",
    });
    return { proceed: false, skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON };
  }

  return { proceed: true };
}

export type RewriteDraftUpdatePauseGateResult =
  | { allowUpdate: true }
  | { allowUpdate: false; skip_reason: string };

export async function evaluateRewriteDraftUpdatePauseGate(
  supabase: SupabaseClient,
  params: {
    weddingId: string;
    photographerId: string;
    draftId: string;
    threadId: string;
  },
): Promise<RewriteDraftUpdatePauseGateResult> {
  const read = await readWeddingAutomationPauseFreshForTenant(
    supabase,
    params.weddingId,
    params.photographerId,
  );

  if (!read.ok) {
    logAutomationPauseObservation({
      observation_type: "inngest_worker_skipped",
      skip_reason: read.reason,
      inngest_function_id: "rewrite-worker",
      wedding_id: params.weddingId,
      thread_id: params.threadId,
      photographer_id: params.photographerId,
      draft_id: params.draftId,
      gate: "pre_update_draft",
    });
    return { allowUpdate: false, skip_reason: read.reason };
  }

  if (read.paused) {
    logAutomationPauseObservation({
      observation_type: "inngest_worker_skipped",
      skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
      inngest_function_id: "rewrite-worker",
      wedding_id: params.weddingId,
      thread_id: params.threadId,
      photographer_id: params.photographerId,
      draft_id: params.draftId,
      gate: "pre_update_draft",
    });
    return { allowUpdate: false, skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON };
  }

  return { allowUpdate: true };
}
