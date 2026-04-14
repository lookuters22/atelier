-- Link staged Gmail imports to canonical threads after human approval (Inbox unfiled lane).

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialized_thread_id UUID REFERENCES public.threads(id) ON DELETE SET NULL;

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS import_provenance JSONB DEFAULT NULL;

COMMENT ON COLUMN public.import_candidates.materialized_thread_id IS
  'Canonical thread created (or linked) when this candidate was approved; Inbox reads threads/messages.';

COMMENT ON COLUMN public.import_candidates.import_provenance IS
  'Audit trail: source, Gmail thread id, label, etc.';

CREATE INDEX IF NOT EXISTS idx_import_candidates_materialized_thread
  ON public.import_candidates (materialized_thread_id)
  WHERE materialized_thread_id IS NOT NULL;
