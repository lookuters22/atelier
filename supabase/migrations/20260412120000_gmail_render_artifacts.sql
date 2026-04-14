-- G3: Store large Gmail HTML render payloads outside JSON metadata; compact pointers in rows.

CREATE TABLE public.gmail_render_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  import_candidate_id uuid REFERENCES public.import_candidates(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'message_attachment_media',
  storage_path text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size >= 0),
  content_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gmail_render_artifacts_owner_chk CHECK (
    (import_candidate_id IS NOT NULL) OR (message_id IS NOT NULL)
  )
);

CREATE INDEX idx_gmail_render_artifacts_photographer ON public.gmail_render_artifacts (photographer_id);
CREATE INDEX idx_gmail_render_artifacts_import_candidate
  ON public.gmail_render_artifacts (import_candidate_id)
  WHERE import_candidate_id IS NOT NULL;
CREATE INDEX idx_gmail_render_artifacts_message
  ON public.gmail_render_artifacts (message_id)
  WHERE message_id IS NOT NULL;

COMMENT ON TABLE public.gmail_render_artifacts IS
  'G3: Sanitized Gmail HTML stored in Storage; metadata holds render_html_ref pointer only.';

ALTER TABLE public.import_candidates
  ADD COLUMN IF NOT EXISTS materialization_render_artifact_id uuid REFERENCES public.gmail_render_artifacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.import_candidates.materialization_render_artifact_id IS
  'G3: FK to gmail_render_artifacts when HTML is stored externally (slim materialization_artifact JSON).';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS gmail_render_artifact_id uuid REFERENCES public.gmail_render_artifacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.messages.gmail_render_artifact_id IS
  'G3: Optional FK to gmail_render_artifacts for imported Gmail HTML (metadata may also carry render_html_ref).';

ALTER TABLE public.gmail_render_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmail_render_artifacts_tenant_isolation" ON public.gmail_render_artifacts
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

GRANT SELECT ON public.gmail_render_artifacts TO authenticated;
GRANT SELECT ON public.gmail_render_artifacts TO service_role;
