-- A6: Tenant-scoped thread delete for Inbox — messages/drafts/etc. cascade per FKs; explicit photographer match.

CREATE OR REPLACE FUNCTION public.delete_inbox_thread(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.threads t
  WHERE t.id = p_thread_id
    AND t.photographer_id = (SELECT auth.uid());

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'thread_not_found_or_denied');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.delete_inbox_thread(uuid) IS
  'A6: Delete one thread owned by the caller; CASCADE removes messages, drafts, and other thread-scoped rows per FKs.';

GRANT EXECUTE ON FUNCTION public.delete_inbox_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inbox_thread(uuid) TO service_role;
