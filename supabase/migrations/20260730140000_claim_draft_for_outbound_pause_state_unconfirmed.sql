-- Wedding-backed outbound claim: fail closed when pause flags cannot be confirmed at claim time
-- (e.g. thread.wedding_id set but no tenant-aligned weddings row for the atomic join).
-- Post-deploy completion for 20260730130000_claim_draft_for_outbound_wedding_pause_gate.sql.

CREATE OR REPLACE FUNCTION public.claim_draft_for_outbound(
  p_draft_id uuid,
  p_photographer_id uuid,
  p_edited_body text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  body text,
  status draft_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.drafts d
  SET
    status = 'approved'::draft_status,
    body = CASE
      WHEN p_edited_body IS NOT NULL THEN p_edited_body
      ELSE d.body
    END
  FROM public.threads t
  LEFT JOIN public.weddings w
    ON w.id = t.wedding_id
    AND w.photographer_id = p_photographer_id
  WHERE d.thread_id = t.id
    AND d.id = p_draft_id
    AND d.status = 'pending_approval'::draft_status
    AND t.photographer_id = p_photographer_id
    AND (
      t.wedding_id IS NULL
      OR (
        w.id IS NOT NULL
        AND w.compassion_pause IS DISTINCT FROM TRUE
        AND w.strategic_pause IS DISTINCT FROM TRUE
      )
    )
  RETURNING d.id, d.thread_id, d.body, d.status;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.drafts d
      INNER JOIN public.threads t
        ON t.id = d.thread_id
        AND t.photographer_id = p_photographer_id
      INNER JOIN public.weddings w
        ON w.id = t.wedding_id
        AND w.photographer_id = p_photographer_id
      WHERE d.id = p_draft_id
        AND d.status = 'pending_approval'::draft_status
        AND (
          w.compassion_pause IS TRUE
          OR w.strategic_pause IS TRUE
        )
    ) THEN
      RAISE EXCEPTION 'claim_blocked_wedding_paused'
        USING ERRCODE = 'P0001',
          DETAIL = 'Linked wedding is compassion- or strategic-paused at atomic claim time.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.drafts d
      INNER JOIN public.threads t
        ON t.id = d.thread_id
        AND t.photographer_id = p_photographer_id
      WHERE d.id = p_draft_id
        AND d.status = 'pending_approval'::draft_status
        AND t.wedding_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.weddings w
          WHERE w.id = t.wedding_id
            AND w.photographer_id = p_photographer_id
        )
    ) THEN
      RAISE EXCEPTION 'claim_blocked_wedding_pause_state_unconfirmed'
        USING ERRCODE = 'P0001',
          DETAIL = 'Wedding-backed draft: cannot confirm wedding pause state for tenant at atomic claim time.';
    END IF;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_draft_for_outbound(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_draft_for_outbound(uuid, uuid, text) TO service_role;
