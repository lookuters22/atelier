-- A4: Operational state for Gmail HTML repair workers (pause + last run summary).
-- Read/written by Inngest workers and `gmail-repair-ops` Edge (service_role only).

CREATE TABLE public.gmail_repair_worker_state (
  id text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  paused_updated_at timestamptz,
  last_run_at timestamptz,
  last_run_ok boolean,
  last_run_scanned int,
  last_run_migrated int,
  last_run_failed int,
  last_run_skipped_already_ref int,
  last_run_skipped_artifact_fk int,
  last_run_skipped_no_inline int,
  last_run_failure_samples jsonb,
  last_run_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gmail_repair_worker_state_id_chk CHECK (
    id IN ('messages_inline_html', 'import_candidate_artifact')
  )
);

COMMENT ON TABLE public.gmail_repair_worker_state IS
  'A4: Pause + last batch summary for Gmail inline-HTML repair workers (cron + manual run-once).';

INSERT INTO public.gmail_repair_worker_state (id) VALUES ('messages_inline_html'), ('import_candidate_artifact')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.gmail_repair_worker_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.gmail_repair_worker_state FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.gmail_repair_worker_state TO service_role;

-- Backlog estimates (same predicates as repair candidate RPCs).

CREATE OR REPLACE FUNCTION public.gmail_messages_inline_html_repair_backlog_count_v1()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.messages m
  WHERE m.metadata IS NOT NULL
    AND m.metadata ? 'gmail_import'
    AND nullif(trim(m.metadata #>> '{gmail_import,body_html_sanitized}'), '') IS NOT NULL
    AND (m.metadata #> '{gmail_import,render_html_ref}') IS NULL
    AND m.gmail_render_artifact_id IS NULL;
$$;

COMMENT ON FUNCTION public.gmail_messages_inline_html_repair_backlog_count_v1() IS
  'A4: Count messages still needing inline Gmail HTML → artifact repair.';

CREATE OR REPLACE FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_backlog_count_v1()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.import_candidates ic
  WHERE ic.materialization_prepare_status = 'prepared'
    AND ic.materialization_artifact IS NOT NULL
    AND ic.materialization_render_artifact_id IS NULL
    AND nullif(trim(ic.materialization_artifact #>> '{metadata,gmail_import,body_html_sanitized}'), '') IS NOT NULL
    AND (ic.materialization_artifact #> '{metadata,gmail_import,render_html_ref}') IS NULL;
$$;

COMMENT ON FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_backlog_count_v1() IS
  'A4: Count prepared import_candidates whose materialization_artifact still has inline Gmail HTML.';

REVOKE ALL ON FUNCTION public.gmail_messages_inline_html_repair_backlog_count_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gmail_messages_inline_html_repair_backlog_count_v1() TO service_role;

REVOKE ALL ON FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_backlog_count_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gmail_import_candidate_artifact_inline_html_repair_backlog_count_v1() TO service_role;
