import { useCallback, useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

import { onDataChanged } from "../lib/events";

import { useAuth } from "../context/AuthContext";

import {

  mapPendingApprovalProjectionRow,

  type PendingDraft,

} from "../lib/pendingApprovalProjection";



export type { PendingDraft };



export function usePendingApprovals() {

  const { photographerId } = useAuth();

  const [drafts, setDrafts] = useState<PendingDraft[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [fetchKey, setFetchKey] = useState(0);



  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);



  useEffect(() => onDataChanged(refetch, { scopes: ["drafts", "all"] }), [refetch]);



  useEffect(() => {

    if (!photographerId) {

      setDrafts([]);

      setError(null);

      setIsLoading(false);

      return;

    }



    let cancelled = false;

    setIsLoading(true);

    setError(null);



    supabase

      .from("v_pending_approval_drafts")

      .select(

        "id, body, thread_id, created_at, thread_title, wedding_id, couple_names, photographer_id",

      )

      .eq("photographer_id", photographerId)

      .order("created_at", { ascending: false })

      .then(({ data: rows, error: err }) => {

        if (cancelled) return;

        if (err) {

          const hint =

            err.code === "PGRST205" || /v_pending_approval_drafts/i.test(String(err.message ?? ""))

              ? " Apply migration 20260430120000_v_pending_approval_drafts.sql (view missing)."

              : "";

          setError(`${err.message}${hint}`);

          setDrafts([]);

          setIsLoading(false);

          return;

        }



        const mapped: PendingDraft[] = (rows ?? []).map((row) =>

          mapPendingApprovalProjectionRow(row as Record<string, unknown>),

        );



        setDrafts(mapped);

        setIsLoading(false);

      });



    return () => {

      cancelled = true;

    };

  }, [photographerId, fetchKey]);



  return { drafts, isLoading, error, count: drafts.length, refetch };

}

