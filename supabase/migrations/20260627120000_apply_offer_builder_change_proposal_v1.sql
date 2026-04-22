-- v1 reviewed apply: pending_review offer-builder metadata proposals only.
-- Maps metadata_patch.name -> studio_offer_builder_projects.name
--     metadata_patch.root_title -> puck_data#>'{root,props,title}' (jsonb_set; no other Puck keys).
-- Mark proposal applied only after the project row update succeeds. Same bounded allowlist as the queue contract.

CREATE OR REPLACE FUNCTION public.apply_offer_builder_change_proposal_v1(
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
  cur_project_id uuid;
  v_payload jsonb;
  v_mp jsonb;
  v_name text;
  v_root_title text;
  v_apply_name boolean := false;
  v_apply_title boolean := false;
  v_k text;
  v_rowcount int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT obcp.review_status, obcp.photographer_id, obcp.project_id, obcp.proposal_payload
  INTO cur_status, cur_photographer, cur_project_id, v_payload
  FROM public.offer_builder_change_proposals obcp
  WHERE obcp.id = p_proposal_id
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

  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid proposal payload';
  END IF;

  IF (v_payload->>'schema_version') IS NULL OR (v_payload->>'schema_version')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'invalid proposal schema_version';
  END IF;

  IF (v_payload->>'project_id') IS NULL
     OR (v_payload->>'project_id')::uuid IS DISTINCT FROM cur_project_id THEN
    RAISE EXCEPTION 'invalid proposal project_id';
  END IF;

  v_mp := v_payload->'metadata_patch';
  IF v_mp IS NULL OR jsonb_typeof(v_mp) <> 'object' THEN
    RAISE EXCEPTION 'invalid metadata_patch';
  END IF;

  FOR v_k IN SELECT * FROM jsonb_object_keys(v_mp) LOOP
    IF v_k NOT IN ('name', 'root_title') THEN
      RAISE EXCEPTION 'metadata_patch: unknown or disallowed key: %', v_k;
    END IF;
  END LOOP;

  IF v_mp ? 'name' THEN
    IF jsonb_typeof(v_mp->'name') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'metadata_patch.name must be a string';
    END IF;
    v_name := btrim(v_mp->>'name');
    IF length(v_name) = 0 OR length(v_name) > 200 THEN
      RAISE EXCEPTION 'metadata_patch.name is empty or too long';
    END IF;
    v_apply_name := true;
  END IF;

  IF v_mp ? 'root_title' THEN
    IF jsonb_typeof(v_mp->'root_title') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'metadata_patch.root_title must be a string';
    END IF;
    v_root_title := btrim(v_mp->>'root_title');
    IF length(v_root_title) = 0 OR length(v_root_title) > 500 THEN
      RAISE EXCEPTION 'metadata_patch.root_title is empty or too long';
    END IF;
    v_apply_title := true;
  END IF;

  IF NOT v_apply_name AND NOT v_apply_title THEN
    RAISE EXCEPTION 'proposal has nothing to apply';
  END IF;

  UPDATE public.studio_offer_builder_projects sop
  SET
    name = CASE WHEN v_apply_name THEN v_name ELSE sop.name END,
    puck_data = CASE WHEN v_apply_title THEN
      jsonb_set(
        coalesce(sop.puck_data, '{}'::jsonb),
        '{root,props,title}',
        to_jsonb(v_root_title::text),
        true
      )
    ELSE sop.puck_data END,
    updated_at = now()
  WHERE sop.id = cur_project_id
    AND sop.photographer_id = cur_photographer;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount <> 1 THEN
    RAISE EXCEPTION 'offer project not found or not updated';
  END IF;

  UPDATE public.offer_builder_change_proposals
  SET review_status = 'applied'
  WHERE id = p_proposal_id;
END;
$$;

COMMENT ON FUNCTION public.apply_offer_builder_change_proposal_v1(uuid) IS
  'Apply a pending offer-builder metadata proposal: name and/or root title only; sets applied only after the project row is updated.';

REVOKE ALL ON FUNCTION public.apply_offer_builder_change_proposal_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_offer_builder_change_proposal_v1(uuid) TO authenticated;
