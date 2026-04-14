import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { onDataChanged } from "../lib/events";

export type FeaturedWedding = {
  id: string;
  couple_names: string;
};

export function useTodayMetrics() {
  const { photographerId } = useAuth();
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [pendingDraftsCount, setPendingDraftsCount] = useState(0);
  const [featuredWedding, setFeaturedWedding] = useState<FeaturedWedding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(
    () =>
      onDataChanged(refetch, {
        scopes: ["inbox", "drafts", "weddings", "all"],
      }),
    [refetch],
  );

  useEffect(() => {
    if (!photographerId) {
      setUnfiledCount(0);
      setPendingDraftsCount(0);
      setFeaturedWedding(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    /** A1: same unfiled set as Inbox list (`v_threads_inbox_latest_message`). */
    const q1 = supabase
      .from("v_threads_inbox_latest_message")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .is("wedding_id", null)
      .neq("kind", "other");

    /** A1: pending approvals count from projection (not raw `drafts`). */
    const q2 = supabase
      .from("v_pending_approval_drafts")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId);

    const today = new Date().toISOString();
    const q3 = supabase
      .from("weddings")
      .select("id, couple_names")
      .eq("photographer_id", photographerId)
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
  }, [photographerId, fetchKey]);

  return { unfiledCount, pendingDraftsCount, featuredWedding, isLoading, refetch };
}
