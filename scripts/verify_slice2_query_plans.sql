-- Manual verification: run against a DB that has applied migration 20260430152000_slice2_pgvector_ann_and_hot_indexes.sql
-- Replace placeholder UUIDs with real tenant / connected_account ids.
-- Expect: index scans on idx_* migration names (or Seq Scan on empty/tiny tables).
--
-- Vector RPC (requires at least one knowledge_base row with non-null embedding for probe vector):
-- EXPLAIN (ANALYZE, COSTS, VERBOSE)
-- SELECT * FROM public.match_knowledge(
--   (SELECT embedding FROM public.knowledge_base WHERE embedding IS NOT NULL LIMIT 1),
--   0.35,
--   5,
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   NULL
-- );

EXPLAIN (COSTS, VERBOSE)
SELECT id, couple_names
FROM public.weddings
WHERE photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
ORDER BY wedding_date DESC NULLS LAST;

EXPLAIN (COSTS, VERBOSE)
SELECT id, title, last_activity_at
FROM public.threads
WHERE photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
ORDER BY last_activity_at DESC NULLS LAST
LIMIT 30;

EXPLAIN (COSTS, VERBOSE)
SELECT d.id, d.created_at
FROM public.drafts d
WHERE d.photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND d.status = 'pending_approval'::public.draft_status
ORDER BY d.created_at DESC;

EXPLAIN (COSTS, VERBOSE)
SELECT t.id, t.due_date
FROM public.tasks t
WHERE t.photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND t.status = 'open'::public.task_status
ORDER BY t.due_date ASC;

EXPLAIN (COSTS, VERBOSE)
SELECT id, created_at
FROM public.import_candidates
WHERE photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND connected_account_id = '00000000-0000-0000-0000-000000000002'::uuid
ORDER BY created_at DESC
LIMIT 100;

-- App-shaped projections (same filters as hooks; RLS may differ when run as postgres vs authenticated)
EXPLAIN (COSTS, VERBOSE)
SELECT id, body, thread_id, created_at, photographer_id
FROM public.v_pending_approval_drafts
WHERE photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
ORDER BY created_at DESC;

EXPLAIN (COSTS, VERBOSE)
SELECT id, title, due_date, wedding_id, couple_names, photographer_id
FROM public.v_open_tasks_with_wedding
WHERE photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
ORDER BY due_date ASC;

EXPLAIN (COSTS, VERBOSE)
SELECT id, wedding_id, title, last_activity_at, photographer_id
FROM public.v_threads_inbox_latest_message
WHERE photographer_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND wedding_id IS NULL
  AND kind <> 'other'
ORDER BY last_activity_at DESC NULLS LAST
LIMIT 200;
