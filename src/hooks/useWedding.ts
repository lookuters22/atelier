import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database.types";

export type WeddingWithRelations = Tables<"weddings"> & {
  clients: Tables<"clients">[];
  threads: (Tables<"threads"> & { messages: Tables<"messages">[] })[];
};

export function useWedding(weddingId: string | undefined) {
  const [data, setData] = useState<WeddingWithRelations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weddingId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    supabase
      .from("weddings")
      .select("*, clients(*), threads(*, messages(*))")
      .eq("id", weddingId)
      .single()
      .then(({ data: row, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setData(null);
        } else {
          setData(row as unknown as WeddingWithRelations);
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [weddingId]);

  return { data, isLoading, error };
}
