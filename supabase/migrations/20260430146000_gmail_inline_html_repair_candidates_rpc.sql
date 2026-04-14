-- A2: Bounded scan for legacy Gmail-import messages that still carry inline
-- `metadata.gmail_import.body_html_sanitized` without `render_html_ref` / FK.
-- Used by Inngest `repair-gmail-messages-inline-html-artifacts` (service_role only).

CREATE OR REPLACE FUNCTION public.gmail_messages_inline_html_repair_candidates_v1(
  p_limit int DEFAULT 25,
  p_after uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  photographer_id uuid,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.id, m.photographer_id, m.metadata
  FROM public.messages m
  WHERE m.metadata IS NOT NULL
    AND m.metadata ? 'gmail_import'
    AND nullif(trim(m.metadata #>> '{gmail_import,body_html_sanitized}'), '') IS NOT NULL
    AND (m.metadata #> '{gmail_import,render_html_ref}') IS NULL
    AND m.gmail_render_artifact_id IS NULL
    AND (p_after IS NULL OR m.id > p_after)
  ORDER BY m.id
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 200);
$$;

COMMENT ON FUNCTION public.gmail_messages_inline_html_repair_candidates_v1(int, uuid) IS
  'A2: Returns messages needing Gmail HTML artifact repair (inline body_html_sanitized, no render_html_ref).';

REVOKE ALL ON FUNCTION public.gmail_messages_inline_html_repair_candidates_v1(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gmail_messages_inline_html_repair_candidates_v1(int, uuid) TO service_role;
