/**
 * A6: Inbox thread domain writes — RPC-backed link and delete.
 * Callers own optimistic UI and `fireDataChanged()` after success when appropriate.
 */
import { supabase } from "./supabase";

export type LinkThreadToWeddingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function linkInboxThreadToWedding(params: {
  threadId: string;
  weddingId: string;
}): Promise<LinkThreadToWeddingResult> {
  const { data, error } = await supabase.rpc("link_thread_to_wedding", {
    p_thread_id: params.threadId,
    p_wedding_id: params.weddingId,
  });

  if (error) {
    const hint =
      error.code === "PGRST202" || /link_thread_to_wedding/i.test(String(error.message ?? ""))
        ? " Apply migration 20260430140000_rpc_link_thread_to_wedding.sql if the RPC is missing."
        : "";
    return { ok: false, error: `${error.message}${hint}` };
  }

  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || typeof row !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  if (row.ok === true) return { ok: true };
  return { ok: false, error: row.error ?? "unknown" };
}

export type DeleteInboxThreadResult =
  | { ok: true }
  | { ok: false; error: string };

/** Delete a thread owned by the current user (`delete_inbox_thread` RPC). */
export async function deleteInboxThread(threadId: string): Promise<DeleteInboxThreadResult> {
  const { data, error } = await supabase.rpc("delete_inbox_thread", {
    p_thread_id: threadId,
  });

  if (error) {
    const hint =
      error.code === "PGRST202" || /delete_inbox_thread/i.test(String(error.message ?? ""))
        ? " Apply migration 20260430141000_rpc_delete_inbox_thread.sql if the RPC is missing."
        : "";
    return { ok: false, error: `${error.message}${hint}` };
  }

  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || typeof row !== "object") {
    return { ok: false, error: "invalid_response" };
  }
  if (row.ok === true) return { ok: true };
  return { ok: false, error: row.error ?? "unknown" };
}
