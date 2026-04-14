/**
 * A6: Draft resolution client — thin wrappers around Edge functions for approve and reject/rewrite.
 * Callers own prompts, toasts, and `fireDataChanged()` after success.
 */
import { supabase } from "./supabase";

/** Invokes `webhook-approval` — same path as Approvals page and timeline “Approve & send”. */
export async function enqueueDraftApprovedForOutbound(draftId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("webhook-approval", {
    body: { draft_id: draftId },
  });
  if (error) throw error;
}

export type BatchApproveDraftsResult = {
  succeeded: string[];
  failed: { id: string; message: string }[];
};

/**
 * A7: Sequential batch approve — same server contract as repeated single approvals (no parallel blast).
 * `onProgress` is called after each successful approve (1-based index, total).
 */
export async function enqueueDraftsApprovedForOutboundBatch(
  draftIds: string[],
  onProgress?: (index: number, total: number) => void,
): Promise<BatchApproveDraftsResult> {
  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];
  const total = draftIds.length;
  let done = 0;
  for (const id of draftIds) {
    try {
      await enqueueDraftApprovedForOutbound(id);
      succeeded.push(id);
      done += 1;
      onProgress?.(done, total);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failed.push({ id, message });
    }
  }
  return { succeeded, failed };
}

/**
 * Reject pending draft and request AI rewrite (`api-resolve-draft` action `reject`).
 * Maps to `pending_approval` → `processing_rewrite` + `ai/draft.rewrite_requested` on the server.
 */
export async function requestDraftRewrite(params: {
  draftId: string;
  feedback: string;
}): Promise<void> {
  const { error } = await supabase.functions.invoke("api-resolve-draft", {
    body: {
      draft_id: params.draftId,
      action: "reject",
      edited_body: "",
      feedback: params.feedback,
    },
  });
  if (error) throw error;
}
