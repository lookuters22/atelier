-- A3: allow `approving` while single-candidate materialization runs in Inngest (not in Edge).

ALTER TABLE public.import_candidates DROP CONSTRAINT IF EXISTS import_candidates_status_check;

ALTER TABLE public.import_candidates
  ADD CONSTRAINT import_candidates_status_check
  CHECK (status IN ('pending', 'approving', 'approved', 'dismissed', 'merged'));

COMMENT ON COLUMN public.import_candidates.status IS
  'pending → human review; approving → single-row approve queued (Inngest); approved/dismissed/merged terminal.';
