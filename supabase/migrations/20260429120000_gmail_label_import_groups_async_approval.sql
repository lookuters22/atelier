-- G5 async: grouped approval runs in Inngest chunks — progress + partial failure visibility.

-- Allow one active row per label while approval is in-flight (pending or approving).
DROP INDEX IF EXISTS public.idx_gmail_label_import_groups_one_pending_per_label;

CREATE UNIQUE INDEX idx_gmail_label_import_groups_one_active_per_label
  ON public.gmail_label_import_groups (photographer_id, connected_account_id, source_identifier)
  WHERE status IN ('pending', 'approving');

ALTER TABLE public.gmail_label_import_groups
  DROP CONSTRAINT IF EXISTS gmail_label_import_groups_status_check;

ALTER TABLE public.gmail_label_import_groups
  ADD CONSTRAINT gmail_label_import_groups_status_check
  CHECK (
    status IN (
      'pending',
      'approving',
      'approved',
      'partially_approved',
      'failed',
      'dismissed'
    )
  );

ALTER TABLE public.gmail_label_import_groups
  ADD COLUMN IF NOT EXISTS approval_total_candidates integer NOT NULL DEFAULT 0
    CHECK (approval_total_candidates >= 0);

ALTER TABLE public.gmail_label_import_groups
  ADD COLUMN IF NOT EXISTS approval_processed_count integer NOT NULL DEFAULT 0
    CHECK (approval_processed_count >= 0);

ALTER TABLE public.gmail_label_import_groups
  ADD COLUMN IF NOT EXISTS approval_approved_count integer NOT NULL DEFAULT 0
    CHECK (approval_approved_count >= 0);

ALTER TABLE public.gmail_label_import_groups
  ADD COLUMN IF NOT EXISTS approval_failed_count integer NOT NULL DEFAULT 0
    CHECK (approval_failed_count >= 0);

ALTER TABLE public.gmail_label_import_groups
  ADD COLUMN IF NOT EXISTS approval_last_error text;

ALTER TABLE public.gmail_label_import_groups
  ADD COLUMN IF NOT EXISTS approval_failed_detail jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.gmail_label_import_groups.approval_total_candidates IS
  'Set when grouped approval starts; candidates remaining to process for this batch.';

COMMENT ON COLUMN public.gmail_label_import_groups.approval_failed_detail IS
  'JSON array of { "import_candidate_id": uuid, "error": string } for failed materializations.';

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS import_approval_error text;

COMMENT ON COLUMN public.import_candidates.import_approval_error IS
  'Grouped approval: last materialization error for this candidate (cleared on success).';
