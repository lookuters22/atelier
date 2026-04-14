-- Merge gate: run in Supabase SQL Editor or `supabase db query --linked -f ...` when pooler is healthy.
-- Replace :tenant and :account with real UUIDs (see queries below).

-- Sample ids (optional — uncomment and set from your DB):
-- SELECT id FROM public.photographers LIMIT 1;
-- SELECT photographer_id, connected_account_id FROM public.import_candidates LIMIT 1;

-- 1) Pending approvals projection
EXPLAIN (COSTS, VERBOSE)
SELECT id, body, thread_id, created_at, photographer_id
FROM public.v_pending_approval_drafts
WHERE photographer_id = '11111111-1111-1111-1111-111111111111'::uuid
ORDER BY created_at DESC;

-- 2) Open tasks projection
EXPLAIN (COSTS, VERBOSE)
SELECT id, title, due_date, wedding_id, couple_names, photographer_id
FROM public.v_open_tasks_with_wedding
WHERE photographer_id = '11111111-1111-1111-1111-111111111111'::uuid
ORDER BY due_date ASC;

-- 3) Inbox latest-message projection
EXPLAIN (COSTS, VERBOSE)
SELECT id, wedding_id, title, last_activity_at, photographer_id
FROM public.v_threads_inbox_latest_message
WHERE photographer_id = '11111111-1111-1111-1111-111111111111'::uuid
  AND wedding_id IS NULL
  AND kind <> 'other'
ORDER BY last_activity_at DESC NULLS LAST
LIMIT 200;

-- 4) Vector ANN path (after at least one knowledge_base row has embedding)
EXPLAIN (ANALYZE, COSTS, VERBOSE)
SELECT kb.id
FROM public.knowledge_base kb
WHERE kb.photographer_id = '11111111-1111-1111-1111-111111111111'::uuid
  AND kb.embedding IS NOT NULL
ORDER BY kb.embedding <=> (
  SELECT embedding FROM public.knowledge_base
  WHERE photographer_id = '11111111-1111-1111-1111-111111111111'::uuid
    AND embedding IS NOT NULL
  LIMIT 1
)
LIMIT 5;
