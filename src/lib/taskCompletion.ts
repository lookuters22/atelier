/**
 * A6: Task completion — `complete_task` RPC (tenant-scoped).
 * Callers own optimistic list updates and refetch on failure.
 */
import { supabase } from "./supabase";

export type CompleteTaskResult =
  | { ok: true }
  | { ok: false; error: string };

export async function completeTaskForPhotographer(taskId: string): Promise<CompleteTaskResult> {
  const { data, error } = await supabase.rpc("complete_task", {
    p_task_id: taskId,
  });

  if (error) {
    const hint =
      error.code === "PGRST202" || /complete_task/i.test(String(error.message ?? ""))
        ? " Apply migration 20260430142000_rpc_complete_task.sql if the RPC is missing."
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
