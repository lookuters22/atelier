-- Post-deploy fix: NULL→resolved CAS on threads.wedding_id + explicit thread_already_linked JSON outcome.
-- (Original migration may already be applied; this replaces only the RPC body.)

CREATE OR REPLACE FUNCTION public.complete_bounded_near_match_thread_wedding_link(
  p_photographer_id uuid,
  p_escalation_id uuid,
  p_resolution_summary text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_er public.escalation_requests%ROWTYPE;
  v_rowcount int;
  v_candidate_text text;
  v_candidate_wedding uuid;
  v_wedding_photographer uuid;
  v_prev_wedding uuid;
  v_thread_wedding_after_failed_update uuid;
  v_old_meta jsonb;
  v_hist jsonb;
  v_event jsonb;
  v_new_meta jsonb;
  v_thread_id uuid;
  v_summary text;
BEGIN
  v_summary := left(trim(both from coalesce(p_resolution_summary, '')), 4000);
  IF length(v_summary) = 0 THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: resolution_summary required';
  END IF;

  SELECT * INTO v_er FROM public.escalation_requests WHERE id = p_escalation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: escalation not found';
  END IF;

  IF v_er.photographer_id <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: tenant mismatch';
  END IF;

  IF v_er.action_key IS DISTINCT FROM 'request_thread_wedding_link' THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: wrong action_key';
  END IF;

  IF v_er.reason_code IS DISTINCT FROM 'bounded_matchmaker_near_match' THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: wrong reason_code';
  END IF;

  v_thread_id := v_er.thread_id;
  IF v_thread_id IS NULL THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: thread_id required';
  END IF;

  v_candidate_text := nullif(trim(both from v_er.decision_justification->>'candidate_wedding_id'), '');
  IF v_candidate_text IS NULL OR length(v_candidate_text) = 0 THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: candidate_wedding_id missing';
  END IF;

  BEGIN
    v_candidate_wedding := v_candidate_text::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: candidate_wedding_id not a uuid';
  END;

  -- Idempotent retry: already finalized this path
  IF v_er.status = 'answered'::public.escalation_status
     AND v_er.resolution_storage_target = 'thread_wedding_link'
  THEN
    RETURN jsonb_build_object(
      'status', 'already_completed',
      'closed_escalation_id', p_escalation_id,
      'thread_id', v_thread_id,
      'wedding_id', v_candidate_wedding
    );
  END IF;

  IF v_er.status IS DISTINCT FROM 'open'::public.escalation_status THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: escalation not open (status=%)', v_er.status;
  END IF;

  SELECT w.photographer_id INTO v_wedding_photographer
  FROM public.weddings w
  WHERE w.id = v_candidate_wedding;

  IF v_wedding_photographer IS NULL THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: wedding_not_found';
  END IF;

  IF v_wedding_photographer <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: wedding tenant mismatch';
  END IF;

  SELECT t.wedding_id, COALESCE(t.ai_routing_metadata, '{}'::jsonb)
  INTO v_prev_wedding, v_old_meta
  FROM public.threads t
  WHERE t.id = v_thread_id
    AND t.photographer_id = p_photographer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: thread_not_found_or_denied';
  END IF;

  v_hist := COALESCE(v_old_meta->'manual_link_history', '[]'::jsonb);
  IF jsonb_typeof(v_hist) <> 'array' THEN
    v_hist := '[]'::jsonb;
  END IF;

  IF jsonb_array_length(v_hist) = 0
     AND (v_old_meta ? 'manual_link')
     AND jsonb_typeof(v_old_meta->'manual_link') = 'object' THEN
    v_hist := jsonb_build_array(v_old_meta->'manual_link');
  END IF;

  v_event := jsonb_build_object(
    'kind', 'link_thread_to_wedding',
    'linked_at', to_jsonb(now()),
    'linked_by', to_jsonb(p_photographer_id),
    'previous_wedding_id', to_jsonb(v_prev_wedding),
    'wedding_id', to_jsonb(v_candidate_wedding),
    'via_escalation_id', to_jsonb(p_escalation_id),
    'bounded_near_match_approval', true
  );

  v_hist := v_hist || jsonb_build_array(v_event);

  v_new_meta := v_old_meta || jsonb_build_object(
    'manual_link_history', v_hist,
    'manual_link', v_event
  );

  UPDATE public.threads t
  SET
    wedding_id = v_candidate_wedding,
    ai_routing_metadata = v_new_meta,
    photographer_id = v_wedding_photographer,
    v3_operator_automation_hold = CASE
      WHEN t.v3_operator_hold_escalation_id IS NOT DISTINCT FROM p_escalation_id THEN false
      ELSE t.v3_operator_automation_hold
    END,
    v3_operator_hold_escalation_id = CASE
      WHEN t.v3_operator_hold_escalation_id IS NOT DISTINCT FROM p_escalation_id THEN NULL
      ELSE t.v3_operator_hold_escalation_id
    END
  WHERE t.id = v_thread_id
    AND t.photographer_id = p_photographer_id
    AND t.wedding_id IS NULL;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    SELECT t.wedding_id INTO v_thread_wedding_after_failed_update
    FROM public.threads t
    WHERE t.id = v_thread_id
      AND t.photographer_id = p_photographer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: thread_not_found_or_denied';
    END IF;

    IF v_thread_wedding_after_failed_update IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'thread_already_linked',
        'thread_id', v_thread_id,
        'existing_wedding_id', v_thread_wedding_after_failed_update,
        'attempted_wedding_id', v_candidate_wedding,
        'escalation_id', p_escalation_id
      );
    END IF;

    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: concurrent_update_detected';
  END IF;

  UPDATE public.escalation_requests
  SET
    status = 'answered'::public.escalation_status,
    resolved_at = now(),
    resolved_decision_mode = 'auto'::public.decision_mode,
    resolution_text = v_summary,
    learning_outcome = 'one_off_case'::public.escalation_learning_outcome,
    resolution_storage_target = 'thread_wedding_link',
    wedding_id = v_candidate_wedding,
    playbook_rule_id = NULL,
    promote_to_playbook = false
  WHERE id = p_escalation_id
    AND photographer_id = p_photographer_id
    AND status = 'open'::public.escalation_status;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'complete_bounded_near_match_thread_wedding_link: finalize failed (concurrent update?)';
  END IF;

  RETURN jsonb_build_object(
    'status', 'completed',
    'closed_escalation_id', p_escalation_id,
    'thread_id', v_thread_id,
    'wedding_id', v_candidate_wedding
  );
END;
$$;

COMMENT ON FUNCTION public.complete_bounded_near_match_thread_wedding_link(uuid, uuid, text) IS
  'Approves bounded_matchmaker_near_match: links thread only when threads.wedding_id IS NULL (CAS); returns thread_already_linked if already linked; clears V3 hold when hold escalation id matches; finalizes escalation.';

REVOKE ALL ON FUNCTION public.complete_bounded_near_match_thread_wedding_link(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_bounded_near_match_thread_wedding_link(uuid, uuid, text) TO service_role;
