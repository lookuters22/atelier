-- v1: review-first queue for bounded invoice template change proposals (InvoiceSetupChangeProposalV1).
-- No apply in this slice — `proposal_payload` stores validated JSON only.

CREATE TABLE public.invoice_setup_change_proposals (
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

COMMENT ON TABLE public.invoice_setup_change_proposals IS
  'Queued invoice setup / PDF template change proposals (InvoiceSetupChangeProposalV1: template_patch allowlist only). Not applied to studio_invoice_setup until a future review→apply path.';

COMMENT ON COLUMN public.invoice_setup_change_proposals.proposal_payload IS
  'Schema v1: invoiceSetupChangeProposal.types — template_patch (legalName, invoicePrefix, paymentTerms, accentColor, footerNote); logo excluded.';

CREATE INDEX idx_invoice_setup_change_proposals_photographer_status_created
  ON public.invoice_setup_change_proposals (photographer_id, review_status, created_at DESC);

ALTER TABLE public.invoice_setup_change_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_setup_change_proposals_tenant_select" ON public.invoice_setup_change_proposals
  FOR SELECT
  USING (photographer_id = (SELECT auth.uid()));

CREATE POLICY "invoice_setup_change_proposals_tenant_insert" ON public.invoice_setup_change_proposals
  FOR INSERT
  WITH CHECK (photographer_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.set_invoice_setup_change_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_setup_change_proposals_updated_at
  BEFORE UPDATE ON public.invoice_setup_change_proposals
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_invoice_setup_change_proposals_updated_at();
