-- Gmail import foundation: connected Google accounts (metadata), OAuth tokens (service_role only),
-- and staged import_candidates (quarantine — no weddings/threads writes here).
-- Approved imports will later materialize into the existing Inbox / canonical thread model.

CREATE TABLE public.connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'google'),
  provider_account_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NULL,
  sync_status TEXT NOT NULL DEFAULT 'connected'
    CHECK (sync_status IN ('connected', 'syncing', 'error', 'disconnected')),
  sync_error_summary TEXT NULL,
  token_expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (photographer_id, provider, provider_account_id)
);

COMMENT ON TABLE public.connected_accounts IS
  'External provider connections (e.g. Gmail). OAuth secrets live in connected_account_oauth_tokens; only service_role reads tokens.';

COMMENT ON COLUMN public.connected_accounts.provider_account_id IS
  'Stable provider subject (e.g. Google sub) for future incremental sync identity.';

COMMENT ON COLUMN public.connected_accounts.sync_error_summary IS
  'Bounded last error (token refresh / sync); cleared on success when applicable.';

CREATE INDEX idx_connected_accounts_photographer ON public.connected_accounts (photographer_id);

ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connected_accounts_tenant_select" ON public.connected_accounts
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

-- No INSERT/UPDATE/DELETE for authenticated users in this slice — Edge uses service_role.

CREATE TABLE public.connected_account_oauth_tokens (
  connected_account_id UUID PRIMARY KEY REFERENCES public.connected_accounts(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.connected_account_oauth_tokens IS
  'Gmail OAuth tokens; RLS enabled with no policies — only service_role (Edge/Inngest) may read/write.';

ALTER TABLE public.connected_account_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: deny all for anon/authenticated; service_role bypasses.

CREATE TABLE public.import_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  connected_account_id UUID NOT NULL REFERENCES public.connected_accounts(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type = 'gmail_label'),
  source_identifier TEXT NOT NULL,
  source_label_name TEXT NOT NULL,
  raw_provider_thread_id TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  snippet TEXT NULL,
  subject TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'dismissed', 'merged')),
  extracted_couple_names TEXT NULL,
  extracted_date DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (photographer_id, connected_account_id, raw_provider_thread_id)
);

COMMENT ON TABLE public.import_candidates IS
  'Staged Gmail (and future) imports — quarantine until human review. Does not link to threads/weddings yet; after approval, rows feed the existing Inbox/canonical model (later slice).';

CREATE INDEX idx_import_candidates_photographer_status
  ON public.import_candidates (photographer_id, status);

CREATE INDEX idx_import_candidates_connected ON public.import_candidates (connected_account_id);

ALTER TABLE public.import_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_candidates_tenant_select" ON public.import_candidates
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

-- Inserts/updates from Inngest use service_role only in this slice.
