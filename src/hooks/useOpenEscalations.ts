import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { onDataChanged } from "../lib/events";
import type { OpenEscalationRow } from "../lib/todayActionFeed";
import { useAuth } from "../context/AuthContext";

export function useOpenEscalations() {
  const { photographerId } = useAuth();
  const [escalations, setEscalations] = useState<OpenEscalationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!photographerId) {
      setEscalations([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    supabase
      .from("escalation_requests")
      .select("id, created_at, question_body, action_key, wedding_id, thread_id")
      .eq("photographer_id", photographerId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useOpenEscalations:", error.message);
          setEscalations([]);
        } else {
          setEscalations((data ?? []) as OpenEscalationRow[]);
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [photographerId, fetchKey]);

  useEffect(() => onDataChanged(refetch, { scopes: ["escalations", "all"] }), [refetch]);

  return { escalations, isLoading, count: escalations.length, refetch };
}
