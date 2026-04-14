-- G5: Grouped Gmail label → one project (wedding) + threads; staging-first, additive.

CREATE TABLE public.gmail_label_import_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  connected_account_id uuid NOT NULL REFERENCES public.connected_accounts(id) ON DELETE CASCADE,
  source_identifier text NOT NULL,
  source_label_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'dismissed')),
  materialized_wedding_id uuid REFERENCES public.weddings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.gmail_label_import_groups IS
  'G5: One Gmail label scope (per account) as a grouped migration unit; approve once → one wedding + linked threads.';

CREATE UNIQUE INDEX idx_gmail_label_import_groups_one_pending_per_label
  ON public.gmail_label_import_groups (photographer_id, connected_account_id, source_identifier)
  WHERE status = 'pending';

CREATE INDEX idx_gmail_label_import_groups_photographer
  ON public.gmail_label_import_groups (photographer_id);

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS gmail_label_import_group_id uuid REFERENCES public.gmail_label_import_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.import_candidates.gmail_label_import_group_id IS
  'G5: Optional FK — staged rows for the same label batch share a group; grouped approval creates one wedding and files threads.';

CREATE INDEX IF NOT EXISTS idx_import_candidates_gmail_label_group
  ON public.import_candidates (gmail_label_import_group_id)
  WHERE gmail_label_import_group_id IS NOT NULL;

ALTER TABLE public.gmail_label_import_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmail_label_import_groups_tenant_select" ON public.gmail_label_import_groups
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

GRANT SELECT ON public.gmail_label_import_groups TO authenticated;
GRANT SELECT ON public.gmail_label_import_groups TO service_role;
