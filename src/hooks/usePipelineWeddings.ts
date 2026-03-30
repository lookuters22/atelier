import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type PipelineWedding = {
  id: string;
  couple_names: string;
  wedding_date: string;
  location: string;
  stage: string;
  contract_value: number | null;
};

export function usePipelineWeddings() {
  const [weddings, setWeddings] = useState<PipelineWedding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    supabase
      .from("weddings")
      .select("id, couple_names, wedding_date, location, stage, contract_value")
      .neq("stage", "archived")
      .order("wedding_date", { ascending: true })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setWeddings([]);
          setIsLoading(false);
          return;
        }

        setWeddings(
          (rows ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            couple_names: r.couple_names as string,
            wedding_date: r.wedding_date as string,
            location: r.location as string,
            stage: r.stage as string,
            contract_value: (r.contract_value as number) ?? null,
          })),
        );
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { weddings, isLoading, error };
}
