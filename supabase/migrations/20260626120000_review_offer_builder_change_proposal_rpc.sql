-- v1 review actions: pending_review → rejected | withdrawn only (no apply). Client calls RPC; RLS stays SELECT+INSERT-only on direct table writes.

CREATE OR REPLACE FUNCTION public.review_offer_builder_change_proposal(
  p_proposal_id uuid,
  p_next_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cur_status text;
  cur_photographer uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_next_status NOT IN ('rejected', 'withdrawn') THEN
    RAISE EXCEPTION 'invalid next_status';
  END IF;

  SELECT review_status, photographer_id INTO cur_status, cur_photographer
  FROM public.offer_builder_change_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal not found';
  END IF;

  IF cur_photographer IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF cur_status IS DISTINCT FROM 'pending_review' THEN
    RAISE EXCEPTION 'proposal not pending review';
  END IF;

  UPDATE public.offer_builder_change_proposals
  SET review_status = p_next_status
  WHERE id = p_proposal_id;
END;
$$;

COMMENT ON FUNCTION public.review_offer_builder_change_proposal(uuid, text) IS
  'Tenant moves an offer-builder change proposal from pending_review to rejected or withdrawn; no payload or apply.';

REVOKE ALL ON FUNCTION public.review_offer_builder_change_proposal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_offer_builder_change_proposal(uuid, text) TO authenticated;
