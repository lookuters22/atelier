-- V3 hardening: single-transaction operator escalation resolution (durable writeback + escalation finalization).
-- Eliminates "artifact committed but escalation still open" after finalize failure.

-- ---------------------------------------------------------------------------
-- Authorized case exception: replace exception + mark escalation answered (one transaction).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_escalation_resolution_authorized_case_exception(
  p_photographer_id uuid,
  p_wedding_id uuid,
  p_thread_id uuid,
  p_escalation_id uuid,
  p_overrides_action_key text,
  p_target_playbook_rule_id uuid,
  p_override_payload jsonb,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_notes text,
  p_learning_outcome public.escalation_learning_outcome
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_er public.escalation_requests%ROWTYPE;
  v_exc_id uuid;
  v_rowcount int;
BEGIN
  SELECT * INTO v_er FROM public.escalation_requests WHERE id = p_escalation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_escalation_resolution_authorized_case_exception: escalation not found';
  END IF;
  IF v_er.photographer_id <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_escalation_resolution_authorized_case_exception: tenant mismatch';
  END IF;
  IF v_er.wedding_id IS DISTINCT FROM p_wedding_id THEN
    RAISE EXCEPTION 'complete_escalation_resolution_authorized_case_exception: wedding mismatch';
  END IF;

  IF v_er.status = 'answered'::public.escalation_status
     AND v_er.resolution_storage_target = 'authorized_case_exceptions'
     AND v_er.learning_outcome IS NOT DISTINCT FROM p_learning_outcome
  THEN
    SELECT e.id INTO v_exc_id
    FROM public.authorized_case_exceptions e
    WHERE e.approved_via_escalation_id = p_escalation_id AND e.status = 'active'
    ORDER BY e.effective_from DESC NULLS LAST
    LIMIT 1;
    IF v_exc_id IS NULL THEN
      SELECT e.id INTO v_exc_id
      FROM public.authorized_case_exceptions e
      WHERE e.approved_via_escalation_id = p_escalation_id
      ORDER BY e.created_at DESC
      LIMIT 1;
    END IF;
    IF v_exc_id IS NULL THEN
      RAISE EXCEPTION 'complete_escalation_resolution_authorized_case_exception: idempotent answered but missing exception';
    END IF;
    RETURN v_exc_id;
  END IF;

  IF v_er.status IS DISTINCT FROM 'open'::public.escalation_status THEN
    RAISE EXCEPTION 'complete_escalation_resolution_authorized_case_exception: escalation not open (status=%)', v_er.status;
  END IF;

  v_exc_id := public.replace_authorized_case_exception_for_escalation(
    p_photographer_id,
    p_wedding_id,
    p_thread_id,
    p_escalation_id,
    p_overrides_action_key,
    p_target_playbook_rule_id,
    p_override_payload,
    p_effective_from,
    p_effective_until,
    p_notes
  );

  UPDATE public.escalation_requests
  SET
    status = 'answered'::public.escalation_status,
    resolved_at = now(),
    resolved_decision_mode = 'auto'::public.decision_mode,
    resolution_text = NULL,
    learning_outcome = p_learning_outcome,
    resolution_storage_target = 'authorized_case_exceptions',
    playbook_rule_id = p_target_playbook_rule_id,
    promote_to_playbook = false
  WHERE id = p_escalation_id
    AND photographer_id = p_photographer_id
    AND status = 'open'::public.escalation_status;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'complete_escalation_resolution_authorized_case_exception: finalize failed (concurrent update?)';
  END IF;

  RETURN v_exc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_escalation_resolution_authorized_case_exception(
  uuid, uuid, uuid, uuid, text, uuid, jsonb, timestamptz, timestamptz, text, public.escalation_learning_outcome
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_escalation_resolution_authorized_case_exception(
  uuid, uuid, uuid, uuid, text, uuid, jsonb, timestamptz, timestamptz, text, public.escalation_learning_outcome
) TO service_role;

-- ---------------------------------------------------------------------------
-- Memories (case narrative)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_escalation_resolution_memory(
  p_photographer_id uuid,
  p_wedding_id uuid,
  p_escalation_id uuid,
  p_title text,
  p_summary text,
  p_full_content text,
  p_learning_outcome public.escalation_learning_outcome
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_er public.escalation_requests%ROWTYPE;
  v_mem_id uuid;
  v_rowcount int;
  v_prefix text := 'escalation_request_id: ' || p_escalation_id::text;
BEGIN
  SELECT * INTO v_er FROM public.escalation_requests WHERE id = p_escalation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: escalation not found';
  END IF;
  IF v_er.photographer_id <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: tenant mismatch';
  END IF;

  IF v_er.status = 'answered'::public.escalation_status
     AND v_er.resolution_storage_target = 'memories'
     AND v_er.learning_outcome IS NOT DISTINCT FROM p_learning_outcome
  THEN
    SELECT m.id INTO v_mem_id
    FROM public.memories m
    WHERE m.photographer_id = p_photographer_id
      AND m.wedding_id IS NOT DISTINCT FROM p_wedding_id
      AND m.type = 'escalation_case_decision'
      AND position(v_prefix in m.full_content) = 1
    LIMIT 1;
    IF v_mem_id IS NULL THEN
      RAISE EXCEPTION 'complete_escalation_resolution_memory: idempotent answered but missing memory';
    END IF;
    RETURN v_mem_id;
  END IF;

  IF v_er.status IS DISTINCT FROM 'open'::public.escalation_status THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: escalation not open (status=%)', v_er.status;
  END IF;

  SELECT m.id INTO v_mem_id
  FROM public.memories m
  WHERE m.photographer_id = p_photographer_id
    AND m.wedding_id IS NOT DISTINCT FROM p_wedding_id
    AND m.type = 'escalation_case_decision'
    AND position(v_prefix in m.full_content) = 1
  LIMIT 1;

  IF v_mem_id IS NULL THEN
    INSERT INTO public.memories (
      photographer_id,
      wedding_id,
      type,
      title,
      summary,
      full_content
    ) VALUES (
      p_photographer_id,
      p_wedding_id,
      'escalation_case_decision',
      left(p_title, 120),
      left(p_summary, 400),
      left(p_full_content, 8000)
    )
    RETURNING id INTO v_mem_id;
  END IF;

  UPDATE public.escalation_requests
  SET
    status = 'answered'::public.escalation_status,
    resolved_at = now(),
    resolved_decision_mode = 'auto'::public.decision_mode,
    resolution_text = NULL,
    learning_outcome = p_learning_outcome,
    resolution_storage_target = 'memories',
    playbook_rule_id = NULL,
    promote_to_playbook = false
  WHERE id = p_escalation_id
    AND photographer_id = p_photographer_id
    AND status = 'open'::public.escalation_status;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'complete_escalation_resolution_memory: finalize failed (concurrent update?)';
  END IF;

  RETURN v_mem_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_escalation_resolution_memory(
  uuid, uuid, uuid, text, text, text, public.escalation_learning_outcome
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_escalation_resolution_memory(
  uuid, uuid, uuid, text, text, text, public.escalation_learning_outcome
) TO service_role;

-- ---------------------------------------------------------------------------
-- Documents (compliance / audit metadata)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_escalation_resolution_document(
  p_photographer_id uuid,
  p_wedding_id uuid,
  p_escalation_id uuid,
  p_title text,
  p_metadata jsonb,
  p_learning_outcome public.escalation_learning_outcome
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_er public.escalation_requests%ROWTYPE;
  v_doc_id uuid;
  v_rowcount int;
BEGIN
  SELECT * INTO v_er FROM public.escalation_requests WHERE id = p_escalation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_escalation_resolution_document: escalation not found';
  END IF;
  IF v_er.photographer_id <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_escalation_resolution_document: tenant mismatch';
  END IF;

  IF v_er.status = 'answered'::public.escalation_status
     AND v_er.resolution_storage_target = 'documents'
     AND v_er.learning_outcome IS NOT DISTINCT FROM p_learning_outcome
  THEN
    SELECT d.id INTO v_doc_id
    FROM public.documents d
    WHERE d.photographer_id = p_photographer_id
      AND (d.metadata->>'escalation_request_id') = p_escalation_id::text
    LIMIT 1;
    IF v_doc_id IS NULL THEN
      RAISE EXCEPTION 'complete_escalation_resolution_document: idempotent answered but missing document';
    END IF;
    RETURN v_doc_id;
  END IF;

  IF v_er.status IS DISTINCT FROM 'open'::public.escalation_status THEN
    RAISE EXCEPTION 'complete_escalation_resolution_document: escalation not open (status=%)', v_er.status;
  END IF;

  SELECT d.id INTO v_doc_id
  FROM public.documents d
  WHERE d.photographer_id = p_photographer_id
    AND (d.metadata->>'escalation_request_id') = p_escalation_id::text
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    INSERT INTO public.documents (
      photographer_id,
      wedding_id,
      kind,
      title,
      metadata
    ) VALUES (
      p_photographer_id,
      p_wedding_id,
      'other'::public.document_kind,
      left(p_title, 200),
      p_metadata
    )
    RETURNING id INTO v_doc_id;
  END IF;

  UPDATE public.escalation_requests
  SET
    status = 'answered'::public.escalation_status,
    resolved_at = now(),
    resolved_decision_mode = 'auto'::public.decision_mode,
    resolution_text = NULL,
    learning_outcome = p_learning_outcome,
    resolution_storage_target = 'documents',
    playbook_rule_id = NULL,
    promote_to_playbook = false
  WHERE id = p_escalation_id
    AND photographer_id = p_photographer_id
    AND status = 'open'::public.escalation_status;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'complete_escalation_resolution_document: finalize failed (concurrent update?)';
  END IF;

  RETURN v_doc_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_escalation_resolution_document(
  uuid, uuid, uuid, text, jsonb, public.escalation_learning_outcome
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_escalation_resolution_document(
  uuid, uuid, uuid, text, jsonb, public.escalation_learning_outcome
) TO service_role;

-- ---------------------------------------------------------------------------
-- Playbook rules (reusable)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_escalation_resolution_playbook(
  p_photographer_id uuid,
  p_escalation_id uuid,
  p_action_key text,
  p_topic text,
  p_instruction text,
  p_learning_outcome public.escalation_learning_outcome
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_er public.escalation_requests%ROWTYPE;
  v_rule_id uuid;
  v_rowcount int;
  v_inst text := left(p_instruction, 8000);
  v_topic text := left(p_topic, 200);
BEGIN
  SELECT * INTO v_er FROM public.escalation_requests WHERE id = p_escalation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'complete_escalation_resolution_playbook: escalation not found';
  END IF;
  IF v_er.photographer_id <> p_photographer_id THEN
    RAISE EXCEPTION 'complete_escalation_resolution_playbook: tenant mismatch';
  END IF;

  IF v_er.status = 'answered'::public.escalation_status
     AND v_er.resolution_storage_target = 'playbook_rules'
     AND v_er.learning_outcome IS NOT DISTINCT FROM p_learning_outcome
  THEN
    IF v_er.playbook_rule_id IS NULL THEN
      RAISE EXCEPTION 'complete_escalation_resolution_playbook: idempotent answered but missing playbook_rule_id';
    END IF;
    RETURN v_er.playbook_rule_id;
  END IF;

  IF v_er.status IS DISTINCT FROM 'open'::public.escalation_status THEN
    RAISE EXCEPTION 'complete_escalation_resolution_playbook: escalation not open (status=%)', v_er.status;
  END IF;

  SELECT pr.id INTO v_rule_id
  FROM public.playbook_rules pr
  WHERE pr.photographer_id = p_photographer_id
    AND pr.action_key = p_action_key
    AND pr.scope = 'global'::public.rule_scope
  LIMIT 1
  FOR UPDATE OF pr;

  IF v_rule_id IS NOT NULL THEN
    UPDATE public.playbook_rules
    SET
      instruction = v_inst,
      updated_at = now(),
      source_type = 'escalation_resolution',
      confidence_label = 'explicit'
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
      p_action_key,
      v_topic,
      'auto'::public.decision_mode,
      v_inst,
      'escalation_resolution',
      'explicit',
      true
    )
    RETURNING id INTO v_rule_id;
  END IF;

  UPDATE public.escalation_requests
  SET
    status = 'answered'::public.escalation_status,
    resolved_at = now(),
    resolved_decision_mode = 'auto'::public.decision_mode,
    resolution_text = NULL,
    learning_outcome = p_learning_outcome,
    resolution_storage_target = 'playbook_rules',
    playbook_rule_id = v_rule_id,
    promote_to_playbook = true
  WHERE id = p_escalation_id
    AND photographer_id = p_photographer_id
    AND status = 'open'::public.escalation_status;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RAISE EXCEPTION 'complete_escalation_resolution_playbook: finalize failed (concurrent update?)';
  END IF;

  RETURN v_rule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_escalation_resolution_playbook(
  uuid, uuid, text, text, text, public.escalation_learning_outcome
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_escalation_resolution_playbook(
  uuid, uuid, text, text, text, public.escalation_learning_outcome
) TO service_role;
