-- A3: Cached Gmail labels.list snapshot per connected account — Edge returns cache fast; worker refreshes in background.

CREATE TABLE public.connected_account_gmail_label_cache (
  connected_account_id UUID PRIMARY KEY REFERENCES public.connected_accounts(id) ON DELETE CASCADE,
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  labels_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  refreshed_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  refresh_in_progress BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gmail_label_cache_photographer
  ON public.connected_account_gmail_label_cache(photographer_id);

ALTER TABLE public.connected_account_gmail_label_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connected_account_gmail_label_cache_tenant_select"
  ON public.connected_account_gmail_label_cache
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

COMMENT ON TABLE public.connected_account_gmail_label_cache IS
  'Cached Gmail labels.list for Settings picker; refreshed via Inngest (A3).';
