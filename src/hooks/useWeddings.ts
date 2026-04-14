import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fireDataChanged, onDataChanged } from "../lib/events";
import type { Tables } from "../types/database.types";

type Wedding = Tables<"weddings">;

export function useWeddings(photographerId: string) {
  const [data, setData] = useState<Wedding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!photographerId) {
      setData([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    supabase
      .from("weddings")
      .select("*")
      .eq("photographer_id", photographerId)
      .order("wedding_date", { ascending: false })
      .limit(500)
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setData([]);
        } else {
          setData(rows ?? []);
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [photographerId, fetchKey]);

  /** Keep Inbox / Pipeline project rails in sync after Settings (e.g. G5 grouped Gmail approve) or other writes that call `fireDataChanged`. */
  useEffect(() => onDataChanged(refetch, { scopes: ["weddings", "all"] }), [refetch]);

  async function deleteWedding(weddingId: string) {
    setData((prev) => prev.filter((w) => w.id !== weddingId));

    const { error: delErr } = await supabase.from("weddings").delete().eq("id", weddingId);

    if (delErr) {
      console.error("deleteWedding error:", delErr.message);
      refetch();
    } else {
      fireDataChanged("weddings");
    }
  }

  return { data, isLoading, error, deleteWedding, refetch };
}
