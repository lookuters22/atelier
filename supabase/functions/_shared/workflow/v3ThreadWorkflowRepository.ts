import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { inferV3ThreadWorkflowInboundPatch, isV3ThreadWorkflowInboundPatchEmpty } from "./inferV3ThreadWorkflowInboundPatch.ts";
import {
  computeV3ThreadWorkflowNextDueAt,
  mergeV3ThreadWorkflow,
} from "./mergeV3ThreadWorkflow.ts";
import type { V3ThreadWorkflowV1 } from "./v3ThreadWorkflowTypes.ts";
import { parseV3ThreadWorkflowV1 } from "./v3ThreadWorkflowTypes.ts";

export async function fetchV3ThreadWorkflowState(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
): Promise<V3ThreadWorkflowV1 | null> {
  const { data, error } = await supabase
    .from("v3_thread_workflow_state")
    .select("workflow")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (error) throw new Error(`v3_thread_workflow_state fetch: ${error.message}`);
  if (!data?.workflow) return null;
  return parseV3ThreadWorkflowV1(data.workflow);
}

/**
 * Merge inbound heuristics into stored workflow and update `next_due_at` index.
 * No-op when threadId missing or patch empty.
 */
export async function upsertV3ThreadWorkflowFromInboundMessage(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    threadId: string | null;
    weddingId: string | null;
    rawMessage: string;
  },
): Promise<void> {
  const { photographerId, threadId, weddingId, rawMessage } = params;
  if (!threadId) return;

  const patch = inferV3ThreadWorkflowInboundPatch(rawMessage);
  if (isV3ThreadWorkflowInboundPatchEmpty(patch)) return;

  const { data: existingRow, error: selErr } = await supabase
    .from("v3_thread_workflow_state")
    .select("workflow")
    .eq("photographer_id", photographerId)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (selErr) throw new Error(`v3_thread_workflow_state select: ${selErr.message}`);

  const merged = mergeV3ThreadWorkflow(existingRow?.workflow, patch);
  const nextDue = computeV3ThreadWorkflowNextDueAt(merged);

  const { error: upErr } = await supabase.from("v3_thread_workflow_state").upsert(
    {
      photographer_id: photographerId,
      thread_id: threadId,
      wedding_id: weddingId,
      workflow: merged as unknown as Record<string, unknown>,
      next_due_at: nextDue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "photographer_id,thread_id" },
  );

  if (upErr) throw new Error(`v3_thread_workflow_state upsert: ${upErr.message}`);
}
