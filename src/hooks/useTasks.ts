import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { onDataChanged } from "../lib/events";
import { completeTaskForPhotographer } from "../lib/taskCompletion";

export type TaskRow = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  wedding_id: string | null;
  couple_names: string | null;
};

export function useTasks() {
  const { photographerId } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  /** A8: align with other projection lists — refetch when global invalidation or `tasks` realtime fires. */
  useEffect(() => onDataChanged(refetch, { scopes: ["tasks", "all"] }), [refetch]);

  useEffect(() => {
    if (!photographerId) {
      setTasks([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    supabase
      .from("v_open_tasks_with_wedding")
      .select("id, title, due_date, status, wedding_id, couple_names")
      .eq("photographer_id", photographerId)
      .order("due_date", { ascending: true })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error("useTasks fetch error:", err.message);
          const hint =
            err.code === "PGRST205" || /v_open_tasks_with_wedding/i.test(String(err.message ?? ""))
              ? " Apply migration 20260430121000_v_open_tasks_with_wedding.sql (view missing)."
              : "";
          setError(`${err.message}${hint}`);
          setTasks([]);
          setIsLoading(false);
          return;
        }

        const mapped: TaskRow[] = (rows ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          title: row.title as string,
          due_date: row.due_date as string,
          status: row.status as string,
          wedding_id: row.wedding_id != null ? String(row.wedding_id) : null,
          couple_names: row.couple_names != null ? String(row.couple_names) : null,
        }));

        setTasks(mapped);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [photographerId, fetchKey]);

  async function completeTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    const result = await completeTaskForPhotographer(taskId);

    if (!result.ok) {
      console.error("completeTask error:", result.error);
      refetch();
    }
  }

  return { tasks, isLoading, error, completeTask, refetch };
}
