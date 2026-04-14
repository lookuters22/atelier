/**
 * A6: Single client entry for dashboard escalation resolution (`dashboard-resolve-escalation`).
 * Callers own UI state, toasts, `fireDataChanged()`, and `onResolved` callbacks.
 */
import { supabase } from "./supabase";

export type ResolveEscalationParams = {
  escalationId: string;
  resolutionSummary: string;
  photographerReplyRaw?: string;
};

export type ResolveEscalationViaDashboardResult = {
  queued: true;
  jobId: string;
};

/**
 * Enqueues resolution via Edge (A3 async). Returns `jobId` for progress polling.
 * Throws on transport error or terminal `{ error }` in JSON body.
 */
export async function resolveEscalationViaDashboard(
  params: ResolveEscalationParams,
): Promise<ResolveEscalationViaDashboardResult> {
  const { data, error } = await supabase.functions.invoke("dashboard-resolve-escalation", {
    body: {
      escalation_id: params.escalationId,
      resolution_summary: params.resolutionSummary,
      photographer_reply_raw: params.photographerReplyRaw?.trim() || undefined,
    },
  });

  if (error) throw error;

  const payload = data as Record<string, unknown> | null;
  const errMsg =
    payload && typeof payload.error === "string" ? payload.error : null;
  if (errMsg === "resolution_already_queued" && typeof payload.job_id === "string") {
    return { queued: true, jobId: payload.job_id };
  }
  if (errMsg) throw new Error(errMsg);

  if (
    payload?.ok === true &&
    payload.queued === true &&
    typeof payload.job_id === "string"
  ) {
    return { queued: true, jobId: payload.job_id };
  }

  throw new Error("Unexpected response from dashboard-resolve-escalation");
}

export type BatchResolveEscalationsResult = {
  succeeded: string[];
  failed: { id: string; message: string }[];
};

/**
 * A7: Queue the same resolution text for multiple open escalations (sequential — same as repeated single queues).
 * Caller must only pass IDs the operator explicitly selected; summary applies to every item.
 */
export async function resolveEscalationsViaDashboardBatch(
  params: {
    escalationIds: string[];
    resolutionSummary: string;
    photographerReplyRaw?: string;
  },
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResolveEscalationsResult> {
  const summary = params.resolutionSummary.trim();
  if (!summary) {
    throw new Error("resolution_summary required");
  }
  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];
  const total = params.escalationIds.length;
  let done = 0;
  for (const escalationId of params.escalationIds) {
    try {
      await resolveEscalationViaDashboard({
        escalationId,
        resolutionSummary: summary,
        photographerReplyRaw: params.photographerReplyRaw?.trim() || undefined,
      });
      succeeded.push(escalationId);
      done += 1;
      onProgress?.(done, total);
    } catch (e) {
      failed.push({
        id: escalationId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { succeeded, failed };
}
