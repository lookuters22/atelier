-- A2: Prepared `import_candidates.materialization_artifact` JSON may still embed
-- `metadata.gmail_import.body_html_sanitized` when G3 persist failed or pre-G3.
-- Repair worker uploads HTML and rewrites nested metadata to `render_html_ref`;
-- idempotency: nested `render_html_ref` OR `materialization_render_artifact_id` excludes rows.

CREATE OR REPLACE FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_candidates_v1(
  p_limit int DEFAULT 25,
  p_after uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  photographer_id uuid,
  materialization_artifact jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT ic.id, ic.photographer_id, ic.materialization_artifact
  FROM public.import_candidates ic
  WHERE ic.materialization_prepare_status = 'prepared'
    AND ic.materialization_artifact IS NOT NULL
    AND ic.materialization_render_artifact_id IS NULL
    AND nullif(trim(ic.materialization_artifact #>> '{metadata,gmail_import,body_html_sanitized}'), '') IS NOT NULL
    AND (ic.materialization_artifact #> '{metadata,gmail_import,render_html_ref}') IS NULL
    AND (p_after IS NULL OR ic.id > p_after)
  ORDER BY ic.id
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 200);
$$;

COMMENT ON FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_candidates_v1(int, uuid) IS
  'A2: import_candidates rows whose prepared materialization_artifact still has inline Gmail HTML (no render_html_ref, no FK).';

REVOKE ALL ON FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_candidates_v1(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_candidates_v1(int, uuid) TO service_role;
