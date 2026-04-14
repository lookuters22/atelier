-- A1: Open tasks with flat wedding labels — replaces nested `tasks -> weddings(...)` client embeds.
-- Read path only; RLS preserved via security_invoker.

CREATE OR REPLACE VIEW public.v_open_tasks_with_wedding
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.photographer_id,
  t.wedding_id,
  t.title,
  t.due_date,
  t.status,
  w.couple_names AS couple_names
FROM public.tasks t
LEFT JOIN public.weddings w ON w.id = t.wedding_id
WHERE t.status = 'open'::public.task_status;

COMMENT ON VIEW public.v_open_tasks_with_wedding IS
  'A1: Open tasks with couple_names from weddings; sort/filter in the client as needed.';

GRANT SELECT ON public.v_open_tasks_with_wedding TO authenticated;
GRANT SELECT ON public.v_open_tasks_with_wedding TO service_role;
