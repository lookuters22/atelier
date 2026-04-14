-- Approve path: when updating an existing playbook_rules row, set is_active = true so promotion
-- always yields a rule visible to deriveEffectivePlaybook (inactive rules are ignored).
-- Idempotent CREATE OR REPLACE for databases that already applied 20260424120000 without this fix.

CREATE OR REPLACE FUNCTION public.review_playbook_rule_candidate(
  p_photographer_id uuid,
  p_candidate_id uuid,
  p_action text,
  p_superseded_by_candidate_id uuid DEFAULT NULL,
  p_override_instruction text DEFAULT NULL,
  p_override_action_key text DEFAULT NULL,
  p_override_decision_mode public.decision_mode DEFAULT NULL,
  p_override_topic text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.playbook_rule_candidates%ROWTYPE;
  v_rule_id uuid;
  v_rowcount int;
  v_action_kind text;
  v_effective_action_key text;
  v_inst text;
  v_topic text;
  v_decision public.decision_mode;
  v_used_overrides boolean;
  v_other public.playbook_rule_candidates%ROWTYPE;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: p_action required';
  END IF;

  v_action_kind := lower(btrim(p_action));
  IF v_action_kind NOT IN ('approve', 'reject', 'supersede') THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: invalid p_action';
  END IF;

  SELECT * INTO v_c FROM public.playbook_rule_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: candidate not found';
  END IF;
  IF v_c.photographer_id IS DISTINCT FROM p_photographer_id THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: tenant mismatch';
  END IF;
  IF v_c.review_status IS DISTINCT FROM 'candidate' THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: candidate not in candidate status (status=%)', v_c.review_status;
  END IF;

  IF v_action_kind = 'reject' THEN
    UPDATE public.playbook_rule_candidates
    SET
      review_status = 'rejected',
      updated_at = now(),
      reviewed_at = now(),
      reviewed_by_photographer_id = p_photographer_id
    WHERE id = p_candidate_id
      AND review_status = 'candidate';

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
      RAISE EXCEPTION 'review_playbook_rule_candidate: reject failed (concurrent update?)';
    END IF;

    RETURN jsonb_build_object(
      'action', 'reject',
      'candidate_id', p_candidate_id,
      'review_status', 'rejected'
    );
  END IF;

  IF v_action_kind = 'supersede' THEN
    IF p_superseded_by_candidate_id IS NOT NULL THEN
      SELECT * INTO v_other FROM public.playbook_rule_candidates WHERE id = p_superseded_by_candidate_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'review_playbook_rule_candidate: superseded_by candidate not found';
      END IF;
      IF v_other.photographer_id IS DISTINCT FROM p_photographer_id THEN
        RAISE EXCEPTION 'review_playbook_rule_candidate: superseded_by tenant mismatch';
      END IF;
      IF v_other.id = p_candidate_id THEN
        RAISE EXCEPTION 'review_playbook_rule_candidate: superseded_by must differ from candidate';
      END IF;
    END IF;

    UPDATE public.playbook_rule_candidates
    SET
      review_status = 'superseded',
      superseded_by_id = p_superseded_by_candidate_id,
      updated_at = now(),
      reviewed_at = now(),
      reviewed_by_photographer_id = p_photographer_id
    WHERE id = p_candidate_id
      AND review_status = 'candidate';

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
      RAISE EXCEPTION 'review_playbook_rule_candidate: supersede failed (concurrent update?)';
    END IF;

    RETURN jsonb_build_object(
      'action', 'supersede',
      'candidate_id', p_candidate_id,
      'review_status', 'superseded',
      'superseded_by_candidate_id', p_superseded_by_candidate_id
    );
  END IF;

  -- approve
  v_used_overrides :=
    p_override_instruction IS NOT NULL
    OR p_override_action_key IS NOT NULL
    OR p_override_decision_mode IS NOT NULL
    OR p_override_topic IS NOT NULL;

  v_inst := left(
    coalesce(nullif(trim(p_override_instruction), ''), v_c.proposed_instruction),
    8000
  );
  v_effective_action_key := coalesce(nullif(trim(p_override_action_key), ''), v_c.proposed_action_key);
  v_topic := left(coalesce(nullif(trim(p_override_topic), ''), v_c.topic), 200);
  v_decision := coalesce(p_override_decision_mode, v_c.proposed_decision_mode);

  IF v_effective_action_key IS NULL OR btrim(v_effective_action_key) = '' THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: effective action_key empty';
  END IF;

  IF (v_c.proposed_scope = 'global'::public.rule_scope AND v_c.proposed_channel IS NOT NULL)
     OR (v_c.proposed_scope = 'channel'::public.rule_scope AND v_c.proposed_channel IS NULL) THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: invalid proposed_scope/proposed_channel for candidate';
  END IF;

  IF v_c.proposed_scope = 'global'::public.rule_scope THEN
    SELECT pr.id INTO v_rule_id
    FROM public.playbook_rules pr
    WHERE pr.photographer_id = p_photographer_id
      AND pr.action_key = v_effective_action_key
      AND pr.scope = 'global'::public.rule_scope
    LIMIT 1
    FOR UPDATE OF pr;

    IF v_rule_id IS NOT NULL THEN
      UPDATE public.playbook_rules
      SET
        topic = v_topic,
        decision_mode = v_decision,
        instruction = v_inst,
        updated_at = now(),
        source_type = 'playbook_rule_candidate_promotion',
        confidence_label = 'explicit',
        is_active = true
      WHERE id = v_rule_id
        AND photographer_id = p_photographer_id;
    ELSE
      INSERT INTO public.playbook_rules (
        photographer_id,
        scope,
        channel,
        action_key,
        topic,
        decision_mode,
        instruction,
        source_type,
        confidence_label,
        is_active
      ) VALUES (
        p_photographer_id,
        'global'::public.rule_scope,
        NULL,
        v_effective_action_key,
        v_topic,
        v_decision,
        v_inst,
        'playbook_rule_candidate_promotion',
        'explicit',
        true
      )
      RETURNING id INTO v_rule_id;
    END IF;

  ELSIF v_c.proposed_scope = 'channel'::public.rule_scope THEN
    SELECT pr.id INTO v_rule_id
    FROM public.playbook_rules pr
    WHERE pr.photographer_id = p_photographer_id
      AND pr.action_key = v_effective_action_key
      AND pr.scope = 'channel'::public.rule_scope
      AND pr.channel = v_c.proposed_channel
    LIMIT 1
    FOR UPDATE OF pr;

    IF v_rule_id IS NOT NULL THEN
      UPDATE public.playbook_rules
      SET
        topic = v_topic,
        decision_mode = v_decision,
        instruction = v_inst,
        updated_at = now(),
        source_type = 'playbook_rule_candidate_promotion',
        confidence_label = 'explicit',
        is_active = true
      WHERE id = v_rule_id
        AND photographer_id = p_photographer_id;
    ELSE
      INSERT INTO public.playbook_rules (
        photographer_id,
        scope,
        channel,
        action_key,
        topic,
        decision_mode,
        instruction,
        source_type,
        confidence_label,
        is_active
      ) VALUES (
        p_photographer_id,
        'channel'::public.rule_scope,
        v_c.proposed_channel,
        v_effective_action_key,
        v_topic,
        v_decision,
        v_inst,
        'playbook_rule_candidate_promotion',
        'explicit',
        true
      )
      RETURNING id INTO v_rule_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'review_playbook_rule_candidate: unsupported proposed_scope';
  END IF;

  UPDATE public.playbook_rule_candidates
  SET
    review_status = 'approved',
    promoted_to_playbook_rule_id = v_rule_id,
    updated_at = now(),
    reviewed_at = now(),
    reviewed_by_photographer_id = p_photographer_id
  WHERE id = p_candidate_id
    AND review_status = 'candidate';

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'review_playbook_rule_candidate: approve failed (concurrent update?)';
  END IF;

  RETURN jsonb_build_object(
    'action', 'approve',
    'candidate_id', p_candidate_id,
    'review_status', 'approved',
    'playbook_rule_id', v_rule_id,
    'used_overrides', v_used_overrides,
    'approved_action_key', v_effective_action_key,
    'approved_decision_mode', v_decision::text,
    'approved_instruction', v_inst,
    'approved_topic', v_topic
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_playbook_rule_candidate(
  uuid, uuid, text, uuid, text, text, public.decision_mode, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_playbook_rule_candidate(
  uuid, uuid, text, uuid, text, text, public.decision_mode, text
) TO service_role;
