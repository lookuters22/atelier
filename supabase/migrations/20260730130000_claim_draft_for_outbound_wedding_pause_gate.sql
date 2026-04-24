-- Slice: outbound pause claim race (F2). Wedding-backed drafts must not transition
-- pending_approval -> approved when the linked wedding is compassion- or strategic-paused
-- at claim time (same atomic boundary as the UPDATE). Unfiled threads (wedding_id NULL)
-- keep prior behavior: no wedding pause join required.
-- Follow-up: `20260730140000_claim_draft_for_outbound_pause_state_unconfirmed.sql` adds
-- explicit fail-closed `claim_blocked_wedding_pause_state_unconfirmed` when the tenant-aligned
-- wedding row is not joinable at claim time.

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
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_draft_for_outbound(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_draft_for_outbound(uuid, uuid, text) TO service_role;
