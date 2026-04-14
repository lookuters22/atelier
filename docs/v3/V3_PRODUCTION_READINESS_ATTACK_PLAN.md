# V3 Production Readiness Attack Plan

## Purpose

This is the execution plan for the pre-production cleanup pass requested before any new feature work.

It is written for AI coding inside this repo and is intentionally surgical.

The goal is not to redesign Atelier OS in one shot.

The goal is to:

1. stop the highest-risk security and cost leaks first
2. replace fake or brute-force backend behavior with real scalable paths
3. reduce frontend reload and polling pressure without destabilizing the product

## Authoritative References

Before implementing any slice, read these first and treat them as canonical:

1. [ARCHITECTURE.md](C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)
2. [DATABASE_SCHEMA.md](C:/Users/Despot/Desktop/wedding/docs/v3/DATABASE_SCHEMA.md)

Do not use older V3 docs as schema truth if they conflict with those files.

Schema truth order:

1. `supabase/migrations/*`
2. `docs/v3/DATABASE_SCHEMA.md`
3. generated database types

## What This Plan Covers

This plan addresses the three most dangerous architectural failure modes in the current repo:

1. fake vector retrieval and missing database/index hardening
2. compounding LLM calls and other backend cost multipliers
3. frontend refetch storms, polling churn, and overfetching

## What This Plan Intentionally Does Not Do

- no product redesign
- no large UX overhaul
- no migration to a new framework
- no broad rewrite of the orchestration runtime
- no speculative schema invention beyond what the architecture and schema docs support
- no secret rotation work for local-only test `.env` values in this phase

## Working Agreement For Vibecoder

These rules are mandatory for every slice.

### 1. Work One Slice At A Time

Do not combine Slice 1, Slice 2, and Slice 3 in one PR or one mega diff.

Each slice must land independently and be verifiable on its own.

### 2. Prefer Small Modular Edits

Do not dump another 500 to 1000 lines into one existing function.

If a target file is already large or fragile:

- extract helpers
- add small focused modules in `_shared/`
- keep orchestration entrypoints readable
- preserve existing interfaces where possible

If a single function would need a massive rewrite, stop and split the work into:

1. compatibility seam
2. helper extraction
3. narrow behavior change

### 3. Preserve Existing Contracts Unless The Slice Explicitly Changes Them

- avoid changing API shapes unless necessary
- avoid renaming tables or columns in these slices
- avoid broad frontend state rewrites when scoped invalidation or pagination is enough

### 4. Do Not Hallucinate Architecture

All assumptions must come from:

- migrations
- current source files
- `docs/v3/ARCHITECTURE.md`
- `docs/v3/DATABASE_SCHEMA.md`

### 5. Keep RLS On In Real Environments

For this plan:

- production: RLS stays on
- staging/test: RLS stays on
- local disposable development: looser behavior is allowed only if explicitly chosen outside this plan

### 6. Prefer Additive Hardening

For this cleanup pass:

- add indexes instead of changing query contracts first
- add helper functions before replacing call sites wholesale
- add compatibility wrappers if an RPC needs to evolve

## Execution Order

1. [Slice 1: Stop The Bleeding](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_SLICE1_STOP_THE_BLEEDING.md)
2. [Slice 2: Database Meltdown](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_SLICE2_DATABASE_MELTDOWN.md)
3. [Slice 3: Browser Crash](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_SLICE3_BROWSER_CRASH.md)

## Why This Order Matters

### Slice 1 first

This removes the most dangerous immediate problems:

- unsecured `knowledge_base`
- overlapping model calls
- weak cost visibility

If nothing else ships, this slice still reduces risk meaningfully.

### Slice 2 second

This turns the database and memory path into something real and scalable:

- vector search becomes actual pgvector retrieval
- hot list queries get proper composite indexes

This should happen before large frontend optimizations so query contracts stabilize first.

### Slice 3 third

This reduces browser and Supabase churn once backend contracts are more stable:

- kill global refetch storm
- reduce polling
- lazy-load expensive inbox content
- add pagination

## Current Hotspots This Plan Is Based On

### Backend / AI

- `supabase/functions/_shared/context/fetchRelevantGlobalKnowledgeForDecisionContext.ts`
- `supabase/functions/inngest/functions/operatorOrchestrator.ts`
- `supabase/functions/_shared/learning/resolveOperatorEscalationResolution.ts`
- `supabase/functions/_shared/learning/executeLearningLoopEscalationResolution.ts`
- `supabase/functions/inngest/functions/clientOrchestratorV1.ts`
- `supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts`
- `supabase/functions/webhook-whatsapp/index.ts`

### Database / Migrations

- `supabase/migrations/20260329084219_add_vector_knowledge_base.sql`
- `supabase/migrations/20260329144000_fix_match_knowledge_rpc.sql`
- `supabase/migrations/20240101000000_init_core_schema.sql`
- `supabase/migrations/20260328_create_tasks.sql`
- `supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql`
- `supabase/migrations/20260411120000_v_threads_inbox_latest_message.sql`
- `supabase/migrations/20260430120000_v_pending_approval_drafts.sql`
- `supabase/migrations/20260430121000_v_open_tasks_with_wedding.sql`

### Frontend

- `src/layouts/DashboardLayout.tsx`
- `src/lib/events.ts`
- `src/hooks/useUnfiledInbox.ts`
- `src/hooks/useWeddings.ts`
- `src/hooks/useWeddingThreads.ts`
- `src/pages/settings/SettingsHubPage.tsx`
- `src/components/escalations/EscalationResolutionPanel.tsx`
- `src/lib/gmailImportMessageMetadata.ts`

## Delivery Standard For Each Slice

Every slice should produce:

1. narrow code changes
2. a short implementation note in the PR description or report
3. verification evidence for the slice acceptance criteria
4. no giant opportunistic cleanup outside the defined scope

## Exit Condition

This production-readiness track is complete when all three slices are landed and the following are true:

- `knowledge_base` is tenant-safe and index-ready
- memory retrieval is real pgvector search, not RAM keyword ranking
- hot list queries have the minimum viable index coverage
- one mutation no longer reloads the entire dashboard
- Gmail HTML is not eagerly fetched for every inbox row
- overlapping LLM calls are reduced and observable
- short-interval polling is removed or tightly scoped
