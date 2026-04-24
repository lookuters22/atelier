-- SU-116a: Denormalize photographer_id onto oauth token rows so service_role reads can scope
-- by connected_account_id + photographer_id (RLS does not apply to service_role).

ALTER TABLE public.connected_account_oauth_tokens
  ADD COLUMN IF NOT EXISTS photographer_id UUID;

UPDATE public.connected_account_oauth_tokens AS t
SET photographer_id = ca.photographer_id
FROM public.connected_accounts AS ca
WHERE ca.id = t.connected_account_id
  AND t.photographer_id IS NULL;

ALTER TABLE public.connected_account_oauth_tokens
  ALTER COLUMN photographer_id SET NOT NULL;

ALTER TABLE public.connected_account_oauth_tokens
  ADD CONSTRAINT connected_account_oauth_tokens_photographer_id_fkey
  FOREIGN KEY (photographer_id) REFERENCES public.photographers(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX connected_account_oauth_tokens_account_photographer_key
  ON public.connected_account_oauth_tokens (connected_account_id, photographer_id);

COMMENT ON COLUMN public.connected_account_oauth_tokens.photographer_id IS
  'Denormalized tenant id for service_role Gmail token lookups (matches connected_accounts.photographer_id).';

CREATE OR REPLACE FUNCTION public.complete_google_oauth_connection(
  p_photographer_id uuid,
  p_provider text,
  p_provider_account_id text,
  p_email text,
  p_display_name text,
  p_token_expires_at timestamptz,
  p_access_token text,
  p_refresh_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_provider IS DISTINCT FROM 'google' THEN
    RAISE EXCEPTION 'complete_google_oauth_connection: invalid provider';
  END IF;

  INSERT INTO public.connected_accounts (
    photographer_id,
    provider,
    provider_account_id,
    email,
    display_name,
    sync_status,
    sync_error_summary,
    token_expires_at,
    updated_at
  )
  VALUES (
    p_photographer_id,
    p_provider,
    p_provider_account_id,
    p_email,
    p_display_name,
    'disconnected',
    NULL,
    p_token_expires_at,
    now()
  )
  ON CONFLICT (photographer_id, provider, provider_account_id)
  DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    sync_error_summary = NULL,
    token_expires_at = EXCLUDED.token_expires_at,
    updated_at = now(),
    sync_status = 'disconnected'
  RETURNING id INTO v_account_id;

  INSERT INTO public.connected_account_oauth_tokens (
    connected_account_id,
    photographer_id,
    access_token,
    refresh_token,
    updated_at
  )
  VALUES (
    v_account_id,
    p_photographer_id,
    p_access_token,
    p_refresh_token,
    now()
  )
  ON CONFLICT (connected_account_id) DO UPDATE SET
    photographer_id = EXCLUDED.photographer_id,
    access_token = EXCLUDED.access_token,
    refresh_token = COALESCE(EXCLUDED.refresh_token, connected_account_oauth_tokens.refresh_token),
    updated_at = now();

  UPDATE public.connected_accounts
  SET
    sync_status = 'connected',
    sync_error_summary = NULL,
    updated_at = now()
  WHERE id = v_account_id;

  RETURN v_account_id;
END;
$$;

COMMENT ON FUNCTION public.complete_google_oauth_connection IS
  'Service-role only: upserts Google connected_account + oauth_tokens atomically; sets sync_status=connected only after tokens persist.';
