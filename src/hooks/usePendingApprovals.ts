import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { onDraftsChanged } from "../lib/events";

export type PendingDraft = {
  id: string;
  body: string;
  thread_title: string;
  wedding_id: string;
  couple_names: string;
  photographer_id: string;
};

export function usePendingApprovals() {
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => onDraftsChanged(refetch), [refetch]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    supabase
      .from("drafts")
      .select("*, threads(title, wedding_id, weddings(id, couple_names, photographer_id))")
      .eq("status", "pending_approval")
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setDrafts([]);
          setIsLoading(false);
          return;
        }

        const mapped: PendingDraft[] = (rows ?? []).map((row: Record<string, unknown>) => {
          const thread = row.threads as Record<string, unknown> | null;
          const wedding = thread?.weddings as Record<string, unknown> | null;
          return {
            id: row.id as string,
            body: row.body as string,
            thread_title: (thread?.title as string) ?? "Thread",
            wedding_id: (wedding?.id as string) ?? "",
            couple_names: (wedding?.couple_names as string) ?? "Unknown",
            photographer_id: (wedding?.photographer_id as string) ?? "",
          };
        });

        setDrafts(mapped);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  return { drafts, isLoading, error, count: drafts.length, refetch };
}
