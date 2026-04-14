-- A6: Single owner for Inbox thread → wedding assignment (tenant-safe, clears ai_routing_metadata).

CREATE OR REPLACE FUNCTION public.link_thread_to_wedding(p_thread_id uuid, p_wedding_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_wedding_photographer uuid;
  v_updated int;
BEGIN
  SELECT w.photographer_id INTO v_wedding_photographer
  FROM public.weddings w
  WHERE w.id = p_wedding_id;

  IF v_wedding_photographer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wedding_not_found');
  END IF;

  IF v_wedding_photographer <> (SELECT auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.threads t
  SET
    wedding_id = p_wedding_id,
    ai_routing_metadata = NULL,
    photographer_id = v_wedding_photographer
  WHERE t.id = p_thread_id
    AND t.photographer_id = (SELECT auth.uid());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_not_found_or_denied');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.link_thread_to_wedding(uuid, uuid) IS
  'A6: Assign inbox thread to wedding; clears ai_routing_metadata; caller must own thread and wedding.';

GRANT EXECUTE ON FUNCTION public.link_thread_to_wedding(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_thread_to_wedding(uuid, uuid) TO service_role;
