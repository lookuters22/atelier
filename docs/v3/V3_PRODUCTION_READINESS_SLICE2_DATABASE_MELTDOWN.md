# V3 Production Readiness Slice 2

## Name

Database Meltdown

## Goal

Replace brute-force or fake backend retrieval with real database-native behavior and add the minimum viable index coverage for known hot queries.

## Canonical References

Read these first:

1. [ARCHITECTURE.md](C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)
2. [DATABASE_SCHEMA.md](C:/Users/Despot/Desktop/wedding/docs/v3/DATABASE_SCHEMA.md)
3. [V3_PRODUCTION_READINESS_ATTACK_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_ATTACK_PLAN.md)
4. [V3_PRODUCTION_READINESS_SLICE1_STOP_THE_BLEEDING.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_SLICE1_STOP_THE_BLEEDING.md)

Do not start this slice until Slice 1 is landed or at least fully understood.

## Scope

This slice covers exactly two areas:

1. real pgvector retrieval for `knowledge_base`
2. composite and support indexes for hot query paths already present in the app

This slice does **not** include the frontend refetch storm, aggressive polling cleanup, or Gmail HTML lazy-loading.

## Why This Slice Exists

The current retrieval path is not true vector search.

Current evidence in:

- `supabase/functions/_shared/context/fetchRelevantGlobalKnowledgeForDecisionContext.ts`

That code currently:

1. pulls up to 100 `knowledge_base` rows into runtime memory
2. stringifies metadata
3. ranks rows by keyword overlap
4. returns the top few rows

This is not scalable semantic retrieval.

It is a bounded brute-force keyword matcher living in application code.

At the same time, several hot list views rely on broad tenant scans with incomplete composite index support.

## Required Implementation Rules

### 1. Preserve Contracts Where Possible

If the frontend or orchestrator already calls `match_knowledge`, prefer improving the backend implementation behind the existing contract instead of changing every caller.

If a contract must evolve:

- add a compatibility wrapper
- change callers in a narrow follow-up step

### 2. Prefer Additive Migrations

- add indexes
- add or replace RPCs carefully
- do not rename or drop core tables in this slice

### 3. No Giant Entrypoint Rewrites

If retrieval logic needs multiple responsibilities, split them into helpers:

- embedding preparation
- RPC invocation
- result normalization
- fallback behavior

Do not turn one context-builder function into a larger blob.

## Current Evidence In Repo

### Fake Memory Retrieval

Relevant file:

- `supabase/functions/_shared/context/fetchRelevantGlobalKnowledgeForDecisionContext.ts`

Current visible truth:

- fetches from `knowledge_base`
- orders by `created_at desc`
- limits to 100 rows
- scores in memory via keyword overlap
- explicitly says pgvector is not used in this slice

### Vector Table / RPC

Relevant migrations:

- `supabase/migrations/20260329084219_add_vector_knowledge_base.sql`
- `supabase/migrations/20260329144000_fix_match_knowledge_rpc.sql`

Current visible truth:

- `knowledge_base.embedding vector(1536)` exists
- `match_knowledge` RPC exists
- no ANN index is defined in those migrations

### Known Hot Query Paths

Relevant frontend and DB files:

- `src/hooks/useWeddings.ts`
- `src/hooks/useUnfiledInbox.ts`
- `src/hooks/useWeddingThreads.ts`
- `supabase/migrations/20240101000000_init_core_schema.sql`
- `supabase/migrations/20260328_create_tasks.sql`
- `supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql`
- `supabase/migrations/20260411120000_v_threads_inbox_latest_message.sql`
- `supabase/migrations/20260430120000_v_pending_approval_drafts.sql`
- `supabase/migrations/20260430121000_v_open_tasks_with_wedding.sql`

## Work Items

### A. Make `knowledge_base` Retrieval Real

Tasks:

1. implement a real vector-search path using pgvector in Postgres
2. prefer `hnsw` unless repo constraints show a concrete reason to use `ivfflat`
3. keep tenant scoping explicit with `photographer_id`
4. keep returned payloads bounded and stable
5. remove the application-side fake ranking from the hot path

Expected direction:

- query should filter by tenant
- query should use embedding similarity in the database
- result count should stay small and deterministic

Do not:

- widen persona input size
- fetch large candidate sets into runtime memory
- replace one brute-force pass with another brute-force pass

### B. Add Supporting `knowledge_base` Indexes

Tasks:

1. add ANN index for `embedding`
2. add supporting btree index for tenant and likely filters

Recommended index direction:

- ANN index on `embedding`
- btree on `(photographer_id, document_type, created_at desc)` or the closest proven query shape

### C. Add Missing Composite Indexes For Existing Hot Queries

This slice should only add indexes that match real current reads.

Minimum candidates to evaluate:

1. `weddings (photographer_id, wedding_date desc)`
2. `threads (photographer_id, last_activity_at desc)`
3. `drafts (photographer_id, status, created_at desc)` or equivalent proven pending-approval path
4. `tasks (photographer_id, status, due_date)`
5. `import_candidates (photographer_id, connected_account_id, created_at desc)`
6. any escalation-status index proven hot by current queries

Do not add speculative indexes without checking actual query shapes.

### D. Validate Query Plans

Tasks:

1. inspect `EXPLAIN` or `EXPLAIN ANALYZE` for the top affected queries
2. confirm the new indexes are actually chosen
3. document any stubborn view or query that still needs a later rewrite

## File Targets To Inspect First

- `supabase/functions/_shared/context/fetchRelevantGlobalKnowledgeForDecisionContext.ts`
- `supabase/migrations/20260329084219_add_vector_knowledge_base.sql`
- `supabase/migrations/20260329144000_fix_match_knowledge_rpc.sql`
- `src/hooks/useWeddings.ts`
- `src/hooks/useUnfiledInbox.ts`
- `src/hooks/useWeddingThreads.ts`
- `supabase/migrations/20240101000000_init_core_schema.sql`
- `supabase/migrations/20260328_create_tasks.sql`
- `supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql`
- `supabase/migrations/20260411120000_v_threads_inbox_latest_message.sql`
- `supabase/migrations/20260430120000_v_pending_approval_drafts.sql`
- `supabase/migrations/20260430121000_v_open_tasks_with_wedding.sql`

## Suggested Change Shape

Preferred implementation pattern:

1. add one migration for vector/index hardening
2. add one focused helper or RPC wrapper for `knowledge_base` retrieval
3. switch the current fake retrieval path to the real backend call
4. validate plans without broad frontend changes

## Acceptance Criteria

This slice is complete when all of the following are true:

1. `knowledge_base` retrieval no longer downloads 100 rows for keyword ranking on the hot path
2. pgvector similarity is executed in Postgres
3. an ANN index exists for `knowledge_base.embedding`
4. supporting tenant/index coverage exists for `knowledge_base`
5. the key hot list queries have the minimum viable composite indexes
6. query-plan validation shows improved access paths for the targeted reads

## Verification Checklist

1. verify migrations apply cleanly
2. verify `match_knowledge` or its replacement works with tenant scoping
3. verify returned result shape is still compatible with current consumers
4. inspect plans for:
   - memory retrieval
   - wedding list
   - inbox latest-message projection
   - pending approvals
   - open tasks
5. confirm no large application-level fallback scan remains on the main retrieval path

## Out Of Scope

- refetch storm fixes
- polling cleanup
- HTML lazy-loading
- browser virtualization
- route-level error boundaries
