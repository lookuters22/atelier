-- A1: Pending approvals list projection — flat draft + thread + wedding fields (no nested PostgREST embeds).
-- Read path only; RLS preserved via security_invoker.

CREATE OR REPLACE VIEW public.v_pending_approval_drafts
WITH (security_invoker = true) AS
SELECT
  d.id,
  d.body,
  d.thread_id,
  d.created_at,
  t.title AS thread_title,
  COALESCE(t.wedding_id, w.id) AS wedding_id,
  COALESCE(w.couple_names, 'Unknown'::text) AS couple_names,
  COALESCE(d.photographer_id, w.photographer_id) AS photographer_id
FROM public.drafts d
INNER JOIN public.threads t ON t.id = d.thread_id
LEFT JOIN public.weddings w ON w.id = t.wedding_id
WHERE d.status = 'pending_approval'::public.draft_status;

COMMENT ON VIEW public.v_pending_approval_drafts IS
  'A1: One row per pending_approval draft with thread title and wedding labels; filter by photographer_id in the client.';

GRANT SELECT ON public.v_pending_approval_drafts TO authenticated;
GRANT SELECT ON public.v_pending_approval_drafts TO service_role;
