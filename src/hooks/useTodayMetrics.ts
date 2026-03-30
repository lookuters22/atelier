import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { onDraftsChanged } from "../lib/events";

export type FeaturedWedding = {
  id: string;
  couple_names: string;
};

export function useTodayMetrics() {
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [pendingDraftsCount, setPendingDraftsCount] = useState(0);
  const [featuredWedding, setFeaturedWedding] = useState<FeaturedWedding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => onDraftsChanged(refetch), [refetch]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const q1 = supabase
      .from("threads")
      .select("id", { count: "exact", head: true })
      .is("wedding_id", null)
      .neq("kind", "other");

    const q2 = supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval");

    const today = new Date().toISOString();
    const q3 = supabase
      .from("weddings")
      .select("id, couple_names")
      .gte("wedding_date", today)
      .in("stage", ["booked", "prep", "contract_out"])
      .order("wedding_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    Promise.all([q1, q2, q3]).then(([r1, r2, r3]) => {
      if (cancelled) return;

      setUnfiledCount(r1.count ?? 0);
      setPendingDraftsCount(r2.count ?? 0);

      if (r3.data) {
        const row = r3.data as Record<string, unknown>;
        setFeaturedWedding({
          id: row.id as string,
          couple_names: row.couple_names as string,
        });
      } else {
        setFeaturedWedding(null);
      }

      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  return { unfiledCount, pendingDraftsCount, featuredWedding, isLoading, refetch };
}
