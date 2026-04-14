-- Repair: duplicate 20260410120000 may have skipped G2 materialization columns on remote.
-- Idempotent copy of 20260410120000_import_candidates_materialization_prepare.sql.

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_prepare_status TEXT NOT NULL DEFAULT 'not_prepared'
    CHECK (materialization_prepare_status IN ('not_prepared', 'preparing', 'prepared', 'prepare_failed'));

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_prepare_error TEXT NULL;

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_prepare_started_at TIMESTAMPTZ NULL;

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_prepared_at TIMESTAMPTZ NULL;

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_artifact JSONB NULL;

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_artifact_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.import_candidates.materialization_prepare_status IS
  'G2: not_prepared | preparing | prepared | prepare_failed — expensive Gmail/HTML work before approve.';

COMMENT ON COLUMN public.import_candidates.materialization_artifact IS
  'G2: serialized materialization snapshot (no OAuth secrets). Approve consumes when prepared.';

CREATE INDEX IF NOT EXISTS idx_import_candidates_prepare_pending
  ON public.import_candidates (photographer_id, status, materialization_prepare_status)
  WHERE status = 'pending';
