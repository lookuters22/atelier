/**
 * Shared mapping for `v_pending_approval_drafts` rows (A1 projection).
 * Keeps list/summary surfaces aligned with one server-side join shape.
 */

export type PendingDraft = {
  id: string;
  body: string;
  thread_id: string;
  thread_title: string;
  wedding_id: string;
  couple_names: string;
  photographer_id: string;
  created_at?: string;
};

export function mapPendingApprovalProjectionRow(row: Record<string, unknown>): PendingDraft {
  const wid = row.wedding_id;
  return {
    id: row.id as string,
    body: typeof row.body === "string" ? row.body : "",
    thread_id: typeof row.thread_id === "string" ? row.thread_id : "",
    thread_title: typeof row.thread_title === "string" ? row.thread_title : "Thread",
    wedding_id: wid != null && String(wid).length > 0 ? String(wid) : "",
    couple_names: typeof row.couple_names === "string" ? row.couple_names : "Unknown",
    photographer_id: typeof row.photographer_id === "string" ? row.photographer_id : "",
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
  };
}
