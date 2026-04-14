-- V3 hardening: atomic replace for authorized_case_exceptions (revoke competing + insert) in one transaction.
-- Eliminates revoke-then-insert half-failure window where the case could be left with no active exception.

CREATE OR REPLACE FUNCTION public.replace_authorized_case_exception_for_escalation(
  p_photographer_id uuid,
  p_wedding_id uuid,
  p_thread_id uuid,
  p_escalation_id uuid,
  p_overrides_action_key text,
  p_target_playbook_rule_id uuid,
  p_override_payload jsonb,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.escalation_requests er
    WHERE er.id = p_escalation_id
      AND er.photographer_id = p_photographer_id
      AND er.wedding_id IS NOT DISTINCT FROM p_wedding_id
  ) THEN
    RAISE EXCEPTION 'replace_authorized_case_exception_for_escalation: escalation tenant/wedding mismatch';
  END IF;

  -- Match TS `revokeCompetingActiveExceptions`: same wedding + action key + thread scope
  UPDATE public.authorized_case_exceptions e
  SET status = 'revoked', updated_at = now()
  WHERE e.photographer_id = p_photographer_id
    AND e.wedding_id = p_wedding_id
    AND e.status = 'active'
    AND e.overrides_action_key = p_overrides_action_key
    AND (
      (p_thread_id IS NULL AND e.thread_id IS NULL)
      OR (p_thread_id IS NOT NULL AND (e.thread_id IS NULL OR e.thread_id = p_thread_id))
    );

  IF p_target_playbook_rule_id IS NOT NULL THEN
    UPDATE public.authorized_case_exceptions e
    SET status = 'revoked', updated_at = now()
    WHERE e.photographer_id = p_photographer_id
      AND e.wedding_id = p_wedding_id
      AND e.status = 'active'
      AND e.target_playbook_rule_id = p_target_playbook_rule_id
      AND (
        (p_thread_id IS NULL AND e.thread_id IS NULL)
        OR (p_thread_id IS NOT NULL AND (e.thread_id IS NULL OR e.thread_id = p_thread_id))
      );
  END IF;

  INSERT INTO public.authorized_case_exceptions (
    photographer_id,
    wedding_id,
    thread_id,
    status,
    overrides_action_key,
    target_playbook_rule_id,
    override_payload,
    approved_by,
    approved_via_escalation_id,
    effective_from,
    effective_until,
    notes,
    updated_at
  ) VALUES (
    p_photographer_id,
    p_wedding_id,
    p_thread_id,
    'active',
    p_overrides_action_key,
    p_target_playbook_rule_id,
    COALESCE(p_override_payload, '{}'::jsonb),
    NULL,
    p_escalation_id,
    p_effective_from,
    p_effective_until,
    p_notes,
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_authorized_case_exception_for_escalation(
  uuid, uuid, uuid, uuid, text, uuid, jsonb, timestamptz, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_authorized_case_exception_for_escalation(
  uuid, uuid, uuid, uuid, text, uuid, jsonb, timestamptz, timestamptz, text
) TO service_role;
