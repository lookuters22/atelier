-- v1: review-first queue for bounded offer-builder metadata proposals (OfferBuilderChangeProposalV1).
-- No apply in this slice — live Puck/name edits use a future RPC after human review.

CREATE TABLE public.offer_builder_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.studio_offer_builder_projects(id) ON DELETE CASCADE,
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offer_builder_change_proposals_payload_project_id_matches
    CHECK (
      proposal_payload ? 'project_id'
      AND (proposal_payload->>'project_id')::uuid = project_id
    )
);

COMMENT ON TABLE public.offer_builder_change_proposals IS
  'Queued offer-builder metadata change proposals (OfferBuilderChangeProposalV1: name / root_title only in v1). Not applied to studio_offer_builder_projects until a future review→apply path.';

COMMENT ON COLUMN public.offer_builder_change_proposals.proposal_payload IS
  'Schema v1: offerBuilderChangeProposal.types — metadata_patch allowlist only; project_id must match column.';

CREATE INDEX idx_offer_builder_change_proposals_photographer_status_created
  ON public.offer_builder_change_proposals (photographer_id, review_status, created_at DESC);

CREATE INDEX idx_offer_builder_change_proposals_project
  ON public.offer_builder_change_proposals (project_id, review_status, created_at DESC);

ALTER TABLE public.offer_builder_change_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offer_builder_change_proposals_tenant_select" ON public.offer_builder_change_proposals
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

CREATE POLICY "offer_builder_change_proposals_tenant_insert" ON public.offer_builder_change_proposals
  FOR INSERT
  WITH CHECK (
    photographer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.studio_offer_builder_projects s
      WHERE s.id = project_id
        AND s.photographer_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.set_offer_builder_change_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER offer_builder_change_proposals_updated_at
  BEFORE UPDATE ON public.offer_builder_change_proposals
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_offer_builder_change_proposals_updated_at();
