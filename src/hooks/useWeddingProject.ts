import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { onDraftsChanged } from "../lib/events";
import type { Tables } from "../types/database.types";

export type ThreadWithDrafts = Tables<"threads"> & {
  messages: Tables<"messages">[];
  drafts: Tables<"drafts">[];
};

export type WeddingProject = Tables<"weddings"> & {
  clients: Tables<"clients">[];
};

export type ProjectTask = {
  id: string;
  title: string;
  due_date: string;
  status: string;
};

export function useWeddingProject(weddingId: string | undefined) {
  const [project, setProject] = useState<WeddingProject | null>(null);
  const [timeline, setTimeline] = useState<ThreadWithDrafts[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => onDraftsChanged(refetch), [refetch]);

  useEffect(() => {
    if (!weddingId) {
      setProject(null);
      setTimeline([]);
      setTasks([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const q1 = supabase
      .from("weddings")
      .select("*, clients(*)")
      .eq("id", weddingId)
      .single();

    const q2 = supabase
      .from("threads")
      .select("*, messages(*), drafts(*)")
      .eq("wedding_id", weddingId)
      .order("last_activity_at", { ascending: false });

    const q3 = supabase
      .from("tasks")
      .select("id, title, due_date, status")
      .eq("wedding_id", weddingId)
      .eq("status", "open")
      .order("due_date", { ascending: true });

    Promise.all([q1, q2, q3]).then(([r1, r2, r3]) => {
      if (cancelled) return;

      if (r1.error) {
        setError(r1.error.message);
        setProject(null);
        setIsLoading(false);
        return;
      }

      setProject(r1.data as unknown as WeddingProject);

      setTimeline(
        ((r2.data ?? []) as unknown as ThreadWithDrafts[]).map((t) => ({
          ...t,
          messages: [...(t.messages ?? [])].sort(
            (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
          ),
          drafts: t.drafts ?? [],
        })),
      );

      setTasks(
        (r3.data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          title: row.title as string,
          due_date: row.due_date as string,
          status: row.status as string,
        })),
      );

      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [weddingId, fetchKey]);

  return { project, timeline, tasks, isLoading, error, refetch };
}
