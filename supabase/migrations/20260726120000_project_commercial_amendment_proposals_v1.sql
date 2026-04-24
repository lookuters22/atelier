-- v1: review-first queue for project-scoped commercial / scope / payment-schedule amendments
-- (ProjectCommercialAmendmentProposalV1). Distinct from memories (advisory), playbook rules, and case exceptions.

CREATE TABLE public.project_commercial_amendment_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id uuid NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  thread_id uuid NULL REFERENCES public.threads(id) ON DELETE SET NULL,
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

COMMENT ON TABLE public.project_commercial_amendment_proposals IS
  'Queued project-specific commercial amendments (pricing, scope, timeline, team, payment schedule). Operator-confirmed enqueue only in v1 — no auto-apply to contracts or invoices.';

COMMENT ON COLUMN public.project_commercial_amendment_proposals.proposal_payload IS
  'Schema v1: projectCommercialAmendmentProposal.types — bounded change_categories + deltas; not a memory_note or case exception.';

CREATE INDEX idx_project_commercial_amendment_proposals_photographer_wedding_status_created
  ON public.project_commercial_amendment_proposals (photographer_id, wedding_id, review_status, created_at DESC);

ALTER TABLE public.project_commercial_amendment_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_commercial_amendment_proposals_tenant_select" ON public.project_commercial_amendment_proposals
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

CREATE POLICY "project_commercial_amendment_proposals_tenant_insert" ON public.project_commercial_amendment_proposals
  FOR INSERT
  WITH CHECK (photographer_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.set_project_commercial_amendment_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_commercial_amendment_proposals_updated_at
  BEFORE UPDATE ON public.project_commercial_amendment_proposals
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_project_commercial_amendment_proposals_updated_at();
