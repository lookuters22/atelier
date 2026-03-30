import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type TaskRow = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  wedding_id: string | null;
  couple_names: string | null;
};

export function useTasks() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    supabase
      .from("tasks")
      .select("*, weddings(id, couple_names)")
      .eq("status", "open")
      .order("due_date", { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useTasks fetch error:", error.message);
          setTasks([]);
          setIsLoading(false);
          return;
        }

        const mapped: TaskRow[] = (rows ?? []).map((row: Record<string, unknown>) => {
          const wedding = row.weddings as Record<string, unknown> | null;
          return {
            id: row.id as string,
            title: row.title as string,
            due_date: row.due_date as string,
            status: row.status as string,
            wedding_id: (wedding?.id as string) ?? null,
            couple_names: (wedding?.couple_names as string) ?? null,
          };
        });

        setTasks(mapped);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  async function completeTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    const { error } = await supabase
      .from("tasks")
      .update({ status: "completed" as const })
      .eq("id", taskId);

    if (error) {
      console.error("completeTask error:", error.message);
      refetch();
    }
  }

  return { tasks, isLoading, completeTask, refetch };
}
