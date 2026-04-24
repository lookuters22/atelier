-- P13 / §6j — structured publication / usage / credit record (v1).
-- Operator confirm via insert edge function only — not memory, playbook, amendment, or case exception.

CREATE TABLE public.project_publication_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  person_id uuid NULL REFERENCES public.people(id) ON DELETE SET NULL,
  thread_id uuid NULL REFERENCES public.threads(id) ON DELETE SET NULL,
  permission_status text NOT NULL CHECK (permission_status IN (
    'withheld_pending_client_approval',
    'permitted_narrow',
    'permitted_broad'
  )),
  permitted_usage_channels text[] NOT NULL DEFAULT '{}'::text[],
  attribution_required boolean NOT NULL DEFAULT false,
  attribution_detail text NULL,
  exclusion_notes text NULL,
  valid_until date NULL,
  evidence_source text NOT NULL CHECK (evidence_source IN (
    'client_email_thread',
    'signed_release',
    'verbal_operator_confirmed'
  )),
  operator_confirmation_summary text NOT NULL,
  source_classification jsonb NOT NULL DEFAULT '{"source":"operator_studio_assistant_confirm","v":1}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_publication_rights_channels_allowed CHECK (
    permitted_usage_channels <@ ARRAY[
      'instagram',
      'social_other',
      'studio_portfolio',
      'editorial',
      'magazine_submission',
      'commercial',
      'print_album',
      'internal_reference_only'
    ]::text[]
  ),
  CONSTRAINT project_publication_rights_permission_shape CHECK (
    (permission_status = 'withheld_pending_client_approval' AND cardinality(permitted_usage_channels) = 0)
    OR (permission_status = 'permitted_narrow' AND cardinality(permitted_usage_channels) >= 1)
    OR (permission_status = 'permitted_broad')
  )
);

COMMENT ON TABLE public.project_publication_rights IS
  'Structured client publication / usage / attribution constraints per project (wedding). Confirmed by operator from Ana only in v1 — distinct from memories (advisory), playbook, amendments, and case exceptions.';

CREATE INDEX idx_project_publication_rights_photographer_wedding_created
  ON public.project_publication_rights (photographer_id, wedding_id, created_at DESC);

ALTER TABLE public.project_publication_rights ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_publication_rights_tenant_select ON public.project_publication_rights
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

CREATE POLICY project_publication_rights_tenant_insert ON public.project_publication_rights
  FOR INSERT
  WITH CHECK (photographer_id = (SELECT auth.uid()));

CREATE POLICY project_publication_rights_tenant_update ON public.project_publication_rights
  FOR UPDATE
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.set_project_publication_rights_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_publication_rights_updated_at
  BEFORE UPDATE ON public.project_publication_rights
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_project_publication_rights_updated_at();

-- Expand operator-assistant audit CHECK (add memory_supersede + publication path).
ALTER TABLE public.operator_assistant_write_audit
  DROP CONSTRAINT IF EXISTS operator_assistant_write_audit_operation_check;

ALTER TABLE public.operator_assistant_write_audit
  ADD CONSTRAINT operator_assistant_write_audit_operation_check CHECK (operation IN (
    'task_create',
    'memory_create',
    'memory_supersede',
    'authorized_case_exception_create',
    'calendar_event_create',
    'calendar_event_reschedule',
    'playbook_rule_candidate_create',
    'publication_rights_record_create'
  ));
