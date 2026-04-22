-- Reviewed apply v1: merge bounded `settings_patch` and/or `studio_business_profile_patch` from a
-- `pending_review` row, then set `review_status = applied` only on success. Uses the same
-- key allowlists as the client (`STUDIO_PROFILE_PROPOSAL_*_KEYS`); `photographers.settings` merge
-- matches `mergePhotographerSettings` semantics; business columns replace values for keys present
-- in the patch. DB CHECK constraints (base_location, extensions.service_areas) enforce shapes.

CREATE OR REPLACE FUNCTION public.apply_studio_profile_change_proposal_v1(
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
  v_patch jsonb;
  v_biz_patch jsonb;
  v_merged jsonb;
  v_biz_id uuid;
  v_rowcount int;
  v_key text;
  v_k text;
  v_has_work boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT review_status, photographer_id, proposal_payload
  INTO cur_status, cur_photographer, v_payload
  FROM public.studio_profile_change_proposals
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

  IF (v_payload->>'schema_version') IS NULL OR (v_payload->>'schema_version')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'invalid proposal schema_version';
  END IF;

  v_patch := v_payload->'settings_patch';
  v_biz_patch := v_payload->'studio_business_profile_patch';
  v_has_work := false;
  IF v_patch IS NOT NULL AND jsonb_typeof(v_patch) = 'object' AND (v_patch <> '{}'::jsonb) THEN
    v_has_work := true;
  END IF;
  IF v_biz_patch IS NOT NULL AND jsonb_typeof(v_biz_patch) = 'object' AND (v_biz_patch <> '{}'::jsonb) THEN
    v_has_work := true;
  END IF;
  IF NOT v_has_work THEN
    RAISE EXCEPTION 'proposal has nothing to apply';
  END IF;

  IF v_patch IS NOT NULL AND jsonb_typeof(v_patch) = 'object' THEN
    FOR v_k IN SELECT * FROM jsonb_object_keys(v_patch) LOOP
      IF v_k NOT IN (
        'studio_name', 'manager_name', 'photographer_names', 'timezone', 'currency',
        'base_location', 'inquiry_first_step_style'
      ) THEN
        RAISE EXCEPTION 'settings_patch: unknown or disallowed key: %', v_k;
      END IF;
    END LOOP;
  END IF;

  IF v_biz_patch IS NOT NULL AND jsonb_typeof(v_biz_patch) = 'object' THEN
    FOR v_k IN SELECT * FROM jsonb_object_keys(v_biz_patch) LOOP
      IF v_k NOT IN (
        'service_types', 'service_availability', 'geographic_scope', 'travel_policy', 'booking_scope',
        'client_types', 'deliverable_types', 'lead_acceptance_rules', 'language_support', 'team_structure',
        'extensions', 'source_type'
      ) THEN
        RAISE EXCEPTION 'studio_business_profile_patch: unknown or disallowed key: %', v_k;
      END IF;
    END LOOP;
  END IF;

  -- settings: merge (null patch value = remove key, same as mergePhotographerSettings for proposal keys)
  IF v_patch IS NOT NULL AND jsonb_typeof(v_patch) = 'object' AND (v_patch <> '{}'::jsonb) THEN
    SELECT coalesce(p.settings, '{}'::jsonb) INTO v_merged
    FROM public.photographers p
    WHERE p.id = cur_photographer
    FOR UPDATE;
    IF v_merged IS NULL THEN
      v_merged := '{}'::jsonb;
    END IF;
    FOR v_key IN SELECT * FROM jsonb_object_keys(v_patch) LOOP
      IF (v_patch->v_key IS NULL) OR (jsonb_typeof(v_patch->v_key) = 'null') THEN
        v_merged := v_merged - v_key;
      ELSE
        v_merged := jsonb_set(v_merged, ARRAY[v_key], v_patch->v_key, true);
      END IF;
    END LOOP;
    UPDATE public.photographers
    SET settings = v_merged
    WHERE id = cur_photographer;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
      RAISE EXCEPTION 'photographer not found or not updated';
    END IF;
  END IF;

  -- business profile: apply per-column when patch present; insert row if none (defaults match finalize v1)
  IF v_biz_patch IS NOT NULL AND jsonb_typeof(v_biz_patch) = 'object' AND (v_biz_patch <> '{}'::jsonb) THEN
    SELECT id INTO v_biz_id
    FROM public.studio_business_profiles
    WHERE photographer_id = cur_photographer
    FOR UPDATE;
    IF v_biz_id IS NULL THEN
      INSERT INTO public.studio_business_profiles (
        photographer_id,
        service_types,
        service_availability,
        geographic_scope,
        travel_policy,
        booking_scope,
        client_types,
        deliverable_types,
        lead_acceptance_rules,
        language_support,
        team_structure,
        extensions,
        core_services,
        source_type,
        updated_at
      ) VALUES (
        cur_photographer,
        COALESCE(v_biz_patch->'service_types', '[]'::jsonb),
        COALESCE(v_biz_patch->'service_availability', '{}'::jsonb),
        COALESCE(v_biz_patch->'geographic_scope', '{}'::jsonb),
        COALESCE(v_biz_patch->'travel_policy', '{}'::jsonb),
        COALESCE(v_biz_patch->'booking_scope', '{}'::jsonb),
        COALESCE(v_biz_patch->'client_types', '[]'::jsonb),
        COALESCE(v_biz_patch->'deliverable_types', '[]'::jsonb),
        COALESCE(v_biz_patch->'lead_acceptance_rules', '{}'::jsonb),
        COALESCE(v_biz_patch->'language_support', '[]'::jsonb),
        COALESCE(v_biz_patch->'team_structure', '{}'::jsonb),
        COALESCE(v_biz_patch->'extensions', '{}'::jsonb),
        '[]'::jsonb,
        COALESCE(nullif(btrim(v_biz_patch->>'source_type'), ''), 'onboarding'),
        now()
      );
    ELSE
      UPDATE public.studio_business_profiles
      SET
        service_types = CASE WHEN v_biz_patch ? 'service_types' THEN (v_biz_patch->'service_types')::jsonb ELSE service_types END,
        service_availability = CASE WHEN v_biz_patch ? 'service_availability' THEN (v_biz_patch->'service_availability')::jsonb ELSE service_availability END,
        geographic_scope = CASE WHEN v_biz_patch ? 'geographic_scope' THEN (v_biz_patch->'geographic_scope')::jsonb ELSE geographic_scope END,
        travel_policy = CASE WHEN v_biz_patch ? 'travel_policy' THEN (v_biz_patch->'travel_policy')::jsonb ELSE travel_policy END,
        booking_scope = CASE WHEN v_biz_patch ? 'booking_scope' THEN (v_biz_patch->'booking_scope')::jsonb ELSE booking_scope END,
        client_types = CASE WHEN v_biz_patch ? 'client_types' THEN (v_biz_patch->'client_types')::jsonb ELSE client_types END,
        deliverable_types = CASE WHEN v_biz_patch ? 'deliverable_types' THEN (v_biz_patch->'deliverable_types')::jsonb ELSE deliverable_types END,
        lead_acceptance_rules = CASE WHEN v_biz_patch ? 'lead_acceptance_rules' THEN (v_biz_patch->'lead_acceptance_rules')::jsonb ELSE lead_acceptance_rules END,
        language_support = CASE WHEN v_biz_patch ? 'language_support' THEN (v_biz_patch->'language_support')::jsonb ELSE language_support END,
        team_structure = CASE WHEN v_biz_patch ? 'team_structure' THEN (v_biz_patch->'team_structure')::jsonb ELSE team_structure END,
        extensions = CASE WHEN v_biz_patch ? 'extensions' THEN (v_biz_patch->'extensions')::jsonb ELSE extensions END,
        source_type = CASE
          WHEN v_biz_patch ? 'source_type' THEN
            coalesce(nullif(btrim(v_biz_patch->>'source_type'), ''), 'onboarding')
          ELSE source_type
        END,
        updated_at = now()
      WHERE id = v_biz_id;
    END IF;
  END IF;

  UPDATE public.studio_profile_change_proposals
  SET review_status = 'applied'
  WHERE id = p_proposal_id;
END;
$$;

COMMENT ON FUNCTION public.apply_studio_profile_change_proposal_v1 IS
  'Apply a pending review studio profile proposal: merge settings + patch business row; same bounded keys as the queue contract; `applied` only after success.';

REVOKE ALL ON FUNCTION public.apply_studio_profile_change_proposal_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_studio_profile_change_proposal_v1(uuid) TO authenticated;
