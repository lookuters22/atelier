import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type ActiveWedding = {
  id: string;
  couple_names: string;
};

export function useActiveWeddings() {
  const [weddings, setWeddings] = useState<ActiveWedding[]>([]);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("weddings")
      .select("id, couple_names")
      .neq("stage", "archived")
      .neq("stage", "delivered")
      .order("couple_names", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useActiveWeddings error:", error.message);
          return;
        }
        setWeddings(
          (data ?? []).map((w: Record<string, unknown>) => ({
            id: w.id as string,
            couple_names: w.couple_names as string,
          })),
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { weddings };
}
