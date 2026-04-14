-- A6: Tenant-scoped task completion — single owner for marking a task `completed`.

CREATE OR REPLACE FUNCTION public.complete_task(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.tasks t
  SET status = 'completed'::public.task_status
  WHERE t.id = p_task_id
    AND t.photographer_id = (SELECT auth.uid());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found_or_denied');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.complete_task(uuid) IS
  'A6: Set task status to completed for the caller tenant; idempotent if already completed.';

GRANT EXECUTE ON FUNCTION public.complete_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid) TO service_role;
