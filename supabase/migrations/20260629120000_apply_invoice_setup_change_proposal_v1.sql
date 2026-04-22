-- v1 reviewed apply: merge bounded `template_patch` into `studio_invoice_setup.template` for `pending_review` rows.
-- Only keys legalName, invoicePrefix, paymentTerms, accentColor, footerNote; never logoDataUrl. Marks `applied` only after live write.

CREATE OR REPLACE FUNCTION public.apply_invoice_setup_change_proposal_v1(
  p_proposal_id uuid
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
  v_payload jsonb;
  v_tp jsonb;
  v_t jsonb;
  v_merged jsonb;
  v_k text;
  v_rowcount int;
  v_has_work boolean := false;
  v_legal text;
  v_inv text;
  v_pay text;
  v_accent text;
  v_foot text;
  v_len int;
  v_row_exists boolean;
  v_foot_set boolean := false;
  v_default constant jsonb :=
    '{"schema_version":1,"legalName":"Atelier · Elena Duarte","invoicePrefix":"ATL","paymentTerms":"Net 15 · Bank transfer","accentColor":"#3b4ed0","footerNote":"Thank you for your business.","logoDataUrl":null}'::jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT iscp.review_status, iscp.photographer_id, iscp.proposal_payload
  INTO cur_status, cur_photographer, v_payload
  FROM public.invoice_setup_change_proposals iscp
  WHERE iscp.id = p_proposal_id
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

  IF v_payload IS NULL OR jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid proposal payload';
  END IF;

  IF (v_payload->>'schema_version') IS NULL OR (v_payload->>'schema_version')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'invalid proposal schema_version';
  END IF;

  v_tp := v_payload->'template_patch';
  IF v_tp IS NULL OR jsonb_typeof(v_tp) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid template_patch';
  END IF;

  FOR v_k IN SELECT * FROM jsonb_object_keys(v_tp) LOOP
    IF v_k NOT IN ('legalName', 'invoicePrefix', 'paymentTerms', 'accentColor', 'footerNote') THEN
      RAISE EXCEPTION 'template_patch: unknown or disallowed key: %', v_k;
    END IF;
  END LOOP;

  IF v_tp ? 'legalName' THEN
    IF jsonb_typeof(v_tp->'legalName') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'template_patch.legalName must be a string';
    END IF;
    v_legal := btrim(v_tp->>'legalName');
    v_len := length(v_legal);
    IF v_len = 0 OR v_len > 300 THEN
      RAISE EXCEPTION 'template_patch.legalName is empty or too long';
    END IF;
    v_has_work := true;
  END IF;

  IF v_tp ? 'invoicePrefix' THEN
    IF jsonb_typeof(v_tp->'invoicePrefix') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'template_patch.invoicePrefix must be a string';
    END IF;
    v_inv := btrim(v_tp->>'invoicePrefix');
    v_len := length(v_inv);
    IF v_len = 0 OR v_len > 32 THEN
      RAISE EXCEPTION 'template_patch.invoicePrefix is empty or too long';
    END IF;
    v_has_work := true;
  END IF;

  IF v_tp ? 'paymentTerms' THEN
    IF jsonb_typeof(v_tp->'paymentTerms') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'template_patch.paymentTerms must be a string';
    END IF;
    v_pay := btrim(v_tp->>'paymentTerms');
    v_len := length(v_pay);
    IF v_len = 0 OR v_len > 4000 THEN
      RAISE EXCEPTION 'template_patch.paymentTerms is empty or too long';
    END IF;
    v_has_work := true;
  END IF;

  IF v_tp ? 'accentColor' THEN
    IF jsonb_typeof(v_tp->'accentColor') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'template_patch.accentColor must be a string';
    END IF;
    v_accent := btrim(v_tp->>'accentColor');
    v_len := length(v_accent);
    IF v_len = 0 OR v_accent !~* '^#([0-9a-f]{3}|[0-9a-f]{6})$' THEN
      RAISE EXCEPTION 'template_patch.accentColor is invalid';
    END IF;
    v_has_work := true;
  END IF;

  IF v_tp ? 'footerNote' THEN
    IF jsonb_typeof(v_tp->'footerNote') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'template_patch.footerNote must be a string';
    END IF;
    IF char_length(v_tp->>'footerNote') > 8000 THEN
      RAISE EXCEPTION 'template_patch.footerNote is too long';
    END IF;
    v_foot := btrim((v_tp->'footerNote')#>>'{}');
    v_foot_set := true;
    v_has_work := true;
  END IF;

  IF NOT v_has_work THEN
    RAISE EXCEPTION 'proposal has nothing to apply';
  END IF;

  SELECT s.template INTO v_t
  FROM public.studio_invoice_setup s
  WHERE s.photographer_id = uid
  FOR UPDATE;

  v_row_exists := FOUND;

  IF NOT v_row_exists OR v_t IS NULL OR jsonb_typeof(v_t) IS DISTINCT FROM 'object' THEN
    v_merged := v_default;
  ELSE
    v_merged := v_t;
  END IF;

  v_merged := jsonb_set(v_merged, '{schema_version}', '1'::jsonb, true);
  IF v_legal IS NOT NULL THEN
    v_merged := jsonb_set(v_merged, '{legalName}', to_jsonb(v_legal::text), true);
  END IF;
  IF v_inv IS NOT NULL THEN
    v_merged := jsonb_set(v_merged, '{invoicePrefix}', to_jsonb(v_inv::text), true);
  END IF;
  IF v_pay IS NOT NULL THEN
    v_merged := jsonb_set(v_merged, '{paymentTerms}', to_jsonb(v_pay::text), true);
  END IF;
  IF v_accent IS NOT NULL THEN
    v_merged := jsonb_set(v_merged, '{accentColor}', to_jsonb(v_accent::text), true);
  END IF;
  IF v_foot_set THEN
    v_merged := jsonb_set(v_merged, '{footerNote}', to_jsonb(v_foot::text), true);
  END IF;
  IF NOT (v_merged ? 'logoDataUrl') THEN
    v_merged := jsonb_set(v_merged, '{logoDataUrl}', 'null'::jsonb, true);
  END IF;

  IF NOT v_row_exists THEN
    INSERT INTO public.studio_invoice_setup (photographer_id, template, updated_at)
    VALUES (uid, v_merged, now());
  ELSE
    UPDATE public.studio_invoice_setup
    SET template = v_merged, updated_at = now()
    WHERE photographer_id = uid;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
      RAISE EXCEPTION 'invoice setup not updated';
    END IF;
  END IF;

  UPDATE public.invoice_setup_change_proposals
  SET review_status = 'applied'
  WHERE id = p_proposal_id;
END;
$$;

COMMENT ON FUNCTION public.apply_invoice_setup_change_proposal_v1(uuid) IS
  'Apply a pending invoice setup proposal: allowlisted template_patch only; no logo; sets applied only after studio_invoice_setup is written.';

REVOKE ALL ON FUNCTION public.apply_invoice_setup_change_proposal_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_invoice_setup_change_proposal_v1(uuid) TO authenticated;
