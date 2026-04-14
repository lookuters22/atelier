# V3 Production Readiness Slice 1

## Name

Stop The Bleeding

## Goal

Reduce immediate security and runaway-cost risk without redesigning the product.

This slice should be safe to ship before any deeper memory or frontend performance work.

## Canonical References

Read these first:

1. [ARCHITECTURE.md](C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)
2. [DATABASE_SCHEMA.md](C:/Users/Despot/Desktop/wedding/docs/v3/DATABASE_SCHEMA.md)
3. [V3_PRODUCTION_READINESS_ATTACK_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_ATTACK_PLAN.md)

## Scope

This slice covers exactly three areas:

1. `knowledge_base` tenant security
2. overlapping LLM-call reduction
3. cost and call-count observability

This slice does **not** include vector search replacement, composite index rollout, pagination, or frontend invalidation redesign.

## Important Constraint

Do not spend this slice rotating local-only test `.env` secrets.

The app is not yet in production and the current ask is architectural hardening, not secret-ops cleanup.

If any `.env` cleanup is touched at all, keep it minimal and non-disruptive.

## Why This Slice Exists

The current codebase has two immediate production blockers:

1. `knowledge_base` appears to exist without proven RLS hardening
2. several orchestration paths can stack multiple model calls for a single event

If left alone, the first can leak cross-tenant memory and the second can create surprise model spend and timeout pressure.

## Current Evidence In Repo

### `knowledge_base`

Relevant files:

- `supabase/migrations/20260329084219_add_vector_knowledge_base.sql`
- `supabase/migrations/20260329144000_fix_match_knowledge_rpc.sql`

Current visible truth:

- table exists
- vector column exists
- `match_knowledge` RPC exists
- no migration was identified in the audit that clearly enables RLS and adds tenant policies for this table

### Overlapping LLM paths

Relevant files:

- `supabase/functions/inngest/functions/operatorOrchestrator.ts`
- `supabase/functions/_shared/learning/resolveOperatorEscalationResolution.ts`
- `supabase/functions/_shared/learning/executeLearningLoopEscalationResolution.ts`
- `supabase/functions/inngest/functions/clientOrchestratorV1.ts`
- `supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts`

Current visible truth:

- operator flow can do multi-round tool LLM calls
- operator escalation resolution can also run a separate classifier
- learning-loop resolution path can classify again
- client orchestration can add a persona rewrite pass after draft generation

The point of this slice is not to remove all multi-step AI behavior.

The point is to remove obvious duplication and put hard accounting around it.

## Required Implementation Rules

### 1. Do Not Rewrite Large Files In One Shot

If `operatorOrchestrator.ts` or another large file needs cleanup:

- extract helpers first
- keep the entrypoint readable
- avoid a single giant edit block

### 2. Preserve Behavior Where Possible

- do not redesign escalation semantics
- do not remove persona rewrite entirely unless clearly proven redundant
- do not change public payload shapes unless required

### 3. Keep Service-Role Writes Working

RLS changes for `knowledge_base` must not break legitimate server-side worker writes.

## Work Items

### A. Harden `knowledge_base` With RLS

Tasks:

1. add a new migration that enables RLS on `knowledge_base`
2. add tenant-safe policies based on `photographer_id`
3. confirm policy behavior matches the current authentication model
4. keep service-role access intact for backend workers

Expected direction:

- authenticated users should only read or mutate their own tenant rows
- service-role workers can continue to manage rows

Do not:

- rename the table
- change the core columns
- combine this with vector index work from Slice 2

### B. Reduce Duplicate LLM Calls

Tasks:

1. map the exact event paths where one workflow can classify the same thing twice
2. choose one canonical resolution/classification path per workflow
3. skip downstream calls when an upstream answer is already sufficient
4. gate persona rewrite so it only runs when the draft is actually eligible and the rewrite provides value

Expected direction:

- keep one authoritative escalation-resolution classifier path
- prevent learning-loop classification from redoing work unnecessarily
- prevent persona rewrite from firing as a default tax on every draft

Do not:

- replace the whole orchestration runtime
- swap model providers in this slice
- redesign prompt contracts unless required to remove duplication

### C. Add Model-Call Observability

Tasks:

1. emit structured logs or counters for each model invocation
2. log workflow id, function name, model, and estimated call count per event
3. add enough visibility to compare before vs after behavior on a real event path

Expected direction:

- one inbound workflow should produce a clear record of how many model calls happened
- duplicate-call regressions should be obvious

Do not:

- build a full analytics product
- add expensive telemetry dependencies if lightweight logging is enough

## Suggested Change Shape

Preferred implementation pattern:

1. add a narrow migration for `knowledge_base` RLS
2. add one small shared helper for model-call accounting if needed
3. extract classification gating helpers from large orchestrators instead of expanding those files

## File Targets To Inspect First

- `supabase/migrations/20260329084219_add_vector_knowledge_base.sql`
- `supabase/migrations/20260329144000_fix_match_knowledge_rpc.sql`
- `supabase/functions/inngest/functions/operatorOrchestrator.ts`
- `supabase/functions/_shared/learning/resolveOperatorEscalationResolution.ts`
- `supabase/functions/_shared/learning/executeLearningLoopEscalationResolution.ts`
- `supabase/functions/inngest/functions/clientOrchestratorV1.ts`
- `supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts`

## Acceptance Criteria

This slice is complete when all of the following are true:

1. `knowledge_base` has RLS enabled in the migration chain
2. `knowledge_base` has tenant-safe policies based on `photographer_id`
3. service-role worker behavior still works
4. the known duplicate classification/rewrite paths are reduced or gated
5. a single workflow logs or exposes how many model calls occurred
6. no giant architectural rewrite was introduced to achieve the above

## Verification Checklist

1. verify migrations apply cleanly
2. verify an authenticated tenant cannot read another tenant's `knowledge_base` rows
3. verify service-role paths still read and write `knowledge_base`
4. exercise one operator escalation flow and capture the model-call count
5. exercise one client draft flow and confirm persona rewrite only runs when intended

## Out Of Scope

- actual pgvector retrieval
- HNSW / ivfflat indexes
- broader composite index pass
- frontend polling cleanup
- frontend pagination
- event-bus redesign
