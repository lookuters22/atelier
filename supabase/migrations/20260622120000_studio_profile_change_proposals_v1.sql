-- v1: durable rows for human-reviewed studio profile change proposals (no apply in this slice).
-- `proposal_payload` stores `StudioProfileChangeProposalV1` JSON; app validates before insert.

CREATE TABLE public.studio_profile_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  review_status text NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN (
      'pending_review',
      'rejected',
      'withdrawn',
      'superseded',
      'applied'
    )),
  proposal_payload jsonb NOT NULL
    CHECK (jsonb_typeof(proposal_payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.studio_profile_change_proposals IS
  'Queued studio profile change proposals (StudioProfileChangeProposalV1). Not applied to settings/profile until a future review→apply path; RLS tenant-scoped.';

COMMENT ON COLUMN public.studio_profile_change_proposals.proposal_payload IS
  'Schema v1: studioProfileChangeProposal.types — settings_patch (narrow allowlist) + studio_business_profile_patch.';

CREATE INDEX idx_studio_profile_change_proposals_photographer_status_created
  ON public.studio_profile_change_proposals (photographer_id, review_status, created_at DESC);

ALTER TABLE public.studio_profile_change_proposals ENABLE ROW LEVEL SECURITY;

-- Review-first: tenant can read and enqueue; no RLS for UPDATE/DELETE (clients cannot mutate
-- `review_status` or remove rows; future review/apply uses service role or new policies).
CREATE POLICY "studio_profile_change_proposals_tenant_select" ON public.studio_profile_change_proposals
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

CREATE POLICY "studio_profile_change_proposals_tenant_insert" ON public.studio_profile_change_proposals
  FOR INSERT
  WITH CHECK (photographer_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.set_studio_profile_change_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER studio_profile_change_proposals_updated_at
  BEFORE UPDATE ON public.studio_profile_change_proposals
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_studio_profile_change_proposals_updated_at();
