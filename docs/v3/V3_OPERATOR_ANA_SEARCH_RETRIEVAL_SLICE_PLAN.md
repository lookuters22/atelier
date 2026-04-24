# V3 Operator Ana Search / Retrieval Slice Plan

## Purpose

This document turns the current grounded search/retrieval architecture review into a small-slice implementation roadmap for `Operator Ana` and the `SupportAssistantWidget`.

It is intentionally shaped for Composer/Vibecoder execution:

- small
- isolated
- testable
- low-drift

This plan assumes the current repo reality:

- current search is still mostly bounded `ILIKE` / heuristic retrieval
- `Operator Ana` already uses bounded read-only lookup tools
- `S4` investigation mode already widens budgets, but does not change the search substrate
- the next architecture step is:
  - Postgres/Supabase first
  - `pg_trgm`
  - generated `tsvector` + `GIN`
  - per-surface indexed search on source tables
  - then cross-surface ranking
  - then a new `operator_search` tool
  - selective `pgvector` only later

## Guiding Principles

- Keep the LLM as planner/summarizer, not the search engine.
- Keep tenant isolation at the SQL layer.
- Prefer additive migrations and narrow rewrites.
- Keep high-risk DDL separate from behavior-changing TypeScript work.
- Do not jump to a giant denormalized mega-index as the first implementation.
- Do not jump to pgvector for messages/threads before lexical retrieval is fixed.

## Recommended Slice Order

1. Slice 1 — `pg_trgm` extension + trigram indexes
2. Slice 2 — FTS on low-volume surfaces (`memories` + `playbook_rules`)
3. Slice 3 — FTS on medium surfaces (`weddings` + `threads`)
4. Slice 4 — FTS on `messages` (`CONCURRENTLY`, isolated)
5. Slice 5 — per-surface search helper functions (unwired)
6. Slice 6 — wire FTS-based corpus search internals
7. Slice 7 — widen entity-index caps
8. Slice 8 — rewrite the message-body probe
9. Slice 9 — cross-surface ranker helper
10. Slice 10 — `operator_search` tool + deep-mode integration
11. Slice 11 — optional later `pgvector` on `memories.full_content` + `weddings.story_notes`

## Slice 1 — pg_trgm Extension + Trigram Indexes

### Goal

Add fuzzy/partial-match index support for name and sender columns.

This is pure schema foundation with no code changes.

### Files

- New migration:
  - `supabase/migrations/YYYYMMDDhhmmss_search_trigram_indexes.sql`

### What It Does

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS people_display_name_trgm
  ON public.people USING GIN (lower(display_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS threads_title_trgm
  ON public.threads USING GIN (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS weddings_couple_names_trgm
  ON public.weddings USING GIN (lower(couple_names) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS messages_sender_trgm
  ON public.messages USING GIN (lower(coalesce(sender, '')) gin_trgm_ops);
```

### Why This Slice Is Isolated / Safe

- purely additive
- no generated columns
- no application code change
- each index is independent
- rollback is simple `DROP INDEX`
- `IF NOT EXISTS` keeps it idempotent

### Acceptance Criteria

- migration applies successfully
- `\d+` shows the new indexes
- `EXPLAIN` on representative fuzzy-name queries uses the trigram indexes
- existing lookup code still runs unchanged
- no RLS changes

### Not Included

- any TypeScript change
- any FTS / `tsvector` work
- any retrieval behavior change

## Slice 2 — FTS on Low-Volume Surfaces (`memories` + `playbook_rules`)

### Goal

Introduce full-text search GIN indexes on the two smallest searchable surfaces first, to validate the pattern safely.

### Files

- New migration:
  - `YYYYMMDDhhmmss_search_fts_memories_playbook.sql`

### What It Does

```sql
ALTER TABLE public.memories
  ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(summary, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS memories_search_tsv_gin
  ON public.memories USING GIN (search_tsv)
  WHERE archived_at IS NULL;

ALTER TABLE public.playbook_rules
  ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(topic, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(action_key, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(instruction, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS playbook_rules_search_tsv_gin
  ON public.playbook_rules USING GIN (search_tsv);
```

Use the `simple` dictionary, not `english`.

### Why This Slice Is Isolated / Safe

- small tables
- generated columns are maintained by Postgres automatically
- partial memory index matches existing `archived_at IS NULL` retrieval
- no production code consumes `search_tsv` yet

### Acceptance Criteria

- migration applies cleanly
- FTS queries on `memories` and `playbook_rules` return expected rows
- `EXPLAIN` shows GIN index usage
- existing tests still pass unchanged

### Not Included

- high-volume tables
- TypeScript changes
- trigram work

## Slice 3 — FTS on Medium Surfaces (`weddings` + `threads`)

### Goal

Extend the same FTS pattern to `weddings` and `threads`.

### Files

- New migration:
  - `YYYYMMDDhhmmss_search_fts_weddings_threads.sql`

### What It Does

```sql
ALTER TABLE public.weddings
  ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(couple_names, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(location, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(story_notes, '')), 'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS weddings_search_tsv_gin
  ON public.weddings USING GIN (search_tsv);

ALTER TABLE public.threads
  ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    ) STORED;

CREATE INDEX IF NOT EXISTS threads_search_tsv_gin
  ON public.threads USING GIN (search_tsv);
```

### Why This Slice Is Isolated / Safe

- same pattern as Slice 2
- still no code consumes the new fields
- moderate table size, manageable migration risk

### Acceptance Criteria

- migration applies in acceptable time
- `lake como` / `villa balbiano` style queries return expected rows
- `EXPLAIN` shows GIN usage
- existing runtime behavior remains unchanged

### Not Included

- `messages`
- TypeScript changes

## Slice 4 — FTS on `messages` (`CONCURRENTLY`, Isolated)

### Goal

Add FTS index support to the largest and riskiest text surface.

This slice must stay isolated.

### Files

- New migration:
  - `YYYYMMDDhhmmss_search_fts_messages.sql`

### What It Does

Use an expression index, not a generated column:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_body_fts_gin
  ON public.messages
  USING GIN (
    (
      setweight(to_tsvector('simple', coalesce(sender, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(body, '')), 'B')
    )
  );
```

### Why This Slice Is Isolated / Safe

- `CONCURRENTLY` avoids stronger write-blocking
- avoids a generated-column table rewrite on a potentially huge table
- rollback is narrow
- easiest slice to test independently in staging

### Acceptance Criteria

- index build completes successfully
- `EXPLAIN` on message-body FTS queries uses the new index
- index is valid after build
- no regression in existing message-touching code paths

### Not Included

- any consumer code
- generated-column approach
- trigram sender work

## Slice 5 — Per-Surface Search Helper Functions (Unwired)

### Goal

Create reusable typed search primitives for each surface, but do not wire them into production paths yet.

### Files

New files:

- `supabase/functions/_shared/search/searchTypes.ts`
- `supabase/functions/_shared/search/searchMessages.ts`
- `supabase/functions/_shared/search/searchThreads.ts`
- `supabase/functions/_shared/search/searchWeddings.ts`
- `supabase/functions/_shared/search/searchMemories.ts`
- `supabase/functions/_shared/search/searchPlaybookRules.ts`
- focused test files for each helper

### Shared Shape

```ts
export type SearchSurface =
  | "threads"
  | "messages"
  | "weddings"
  | "memories"
  | "playbook"
  | "case_exception"
  | "offer";

export type SearchHit = {
  surface: SearchSurface;
  id: string;
  rank: number;
  snippet: string;
  metadata: Record<string, unknown>;
};

export type SearchOptions = {
  limit?: number;
  participantPersonIds?: string[];
};
```

### Why This Slice Is Isolated / Safe

- additive only
- no consumer rewiring yet
- easy to test in isolation
- clean rollback boundary before behavior changes

### Acceptance Criteria

- helpers compile
- helper tests pass
- helper queries use the new indexes
- tenant isolation is tested
- snippets are clipped consistently

### Not Included

- any change to current Ana behavior
- any change to `fetchAssistantOperatorCorpusSearch.ts`
- cross-surface ranking

## Slice 6 — Wire FTS-Based Corpus Search Internals

### Goal

Rewrite `fetchAssistantOperatorCorpusSearch.ts` to use the new per-surface search helpers while preserving the existing output shape.

### Files

- `supabase/functions/_shared/context/fetchAssistantOperatorCorpusSearch.ts`
- its test file

### What It Does

- replace per-surface `ILIKE` loops with Slice 5 helper calls
- keep the exact current snapshot shape:
  - `threadHits`
  - `projectHits`
  - `playbookHits`
  - `caseExceptionHits`
  - `memoryHits`
  - `offerProjectHits`
  - `invoiceTemplateMentioned`
  - `tokensQueried`
  - `scopeNote`
  - `deepMode`
  - `messageBodyProbeRan`
- leave the message-body probe unchanged in this slice
- keep playbook/case-exception in-memory matching untouched for now

### Why This Slice Is Isolated / Safe

- consumer-facing shape does not change
- one-file behavior rewrite
- easy rollback if search quality regresses

### Acceptance Criteria

- existing tests pass
- new regression tests show old recency-bias misses are improved
- per-surface caps remain bounded
- tenant isolation remains intact
- `scopeNote` truthfully describes FTS-based selection

### Not Included

- message-body probe rewrite
- entity-index widening
- new tool additions

## Slice 7 — Widen Entity-Index Caps

### Goal

Reduce older-project misses caused by tiny candidate pools in entity resolution.

### Files

- `supabase/functions/_shared/context/fetchAssistantQueryEntityIndex.ts`
- `resolveOperatorQueryEntitiesFromIndex.test.ts`

### What It Does

- raise wedding cap from `60` to `200`
- raise people cap from `50` to `200`
- add lightweight telemetry for fetch duration

### Why This Slice Is Isolated / Safe

- tiny code change
- existing resolver logic stays intact
- no schema work

### Acceptance Criteria

- existing tests pass
- new test proves older entity rows still resolve
- latency remains acceptable

### Not Included

- resolver algorithm changes
- switching this path to FTS

## Slice 8 — Rewrite the Message-Body Probe

### Goal

Replace the current recency-biased message-body probe with bounded FTS ranking plus recency decay.

### Files

- `supabase/functions/_shared/context/fetchAssistantOperatorCorpusSearch.ts`
- its test file

### What It Does

Replace:

- `ILIKE`
- `ORDER BY sent_at DESC`
- tiny newest-row bias

with:

- FTS-ranked message-body retrieval
- bounded result count
- recency decay multiplier

### Why This Slice Is Isolated / Safe

- focused diff in one retrieval path
- depends cleanly on Slice 4
- preserves current gating behavior

### Acceptance Criteria

- old-but-relevant message hits can now win over recent irrelevant noise
- recency still matters when textual relevance is similar
- gating behavior remains unchanged

### Not Included

- changing probe trigger rules
- cross-surface ranking

## Slice 9 — Cross-Surface Ranker Helper

### Goal

Add a unified ranker that composes per-surface search helpers into one ranked list.

### Files

New files:

- `supabase/functions/_shared/search/searchCrossSurface.ts`
- `supabase/functions/_shared/search/searchCrossSurface.test.ts`

### What It Does

- runs per-surface helpers in parallel
- normalizes ranks
- applies fixed per-surface weights
- returns a unified top-N `SearchHit[]`

Initial static weights:

- `threads`: `1.0`
- `messages`: `1.0`
- `weddings`: `0.9`
- `memories`: `0.85`
- `playbook`: `0.6`

### Why This Slice Is Isolated / Safe

- no new SQL
- pure composition logic
- not yet wired to the LLM

### Acceptance Criteria

- deterministic fixture tests pass
- tenant isolation holds through the fanout
- latency remains acceptable

### Not Included

- `operator_search` tool
- dynamic or learned weights
- reranking

## Slice 10 — `operator_search` Tool + Deep-Mode Integration

### Goal

Expose the cross-surface ranker to Ana as one new search tool and teach the prompt when to use it.

### Files

- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.ts`
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts`
- prompt/golden tests

### What It Does

Add:

- `operator_search(query, surfaces?, limit?)`

Behavior:

- counts toward the existing read-only tool budget
- normal mode uses a smaller limit
- `S4` investigation mode can use a wider limit
- prompt guidance says:
  - use `operator_search` first for open-ended “find anything about X” style questions
  - then use `operator_lookup_*` tools to hydrate top hits

### Why This Slice Is Isolated / Safe

- additive capability
- existing tools remain unchanged
- prompt change is small and test-locked

### Acceptance Criteria

- tool schema and handler tests pass
- golden prompt tests pass
- integration tests show `operator_search` is preferred for broad search questions
- deep mode gets the wider limit

### Not Included

- replacing existing lookup tools
- auto-calling search from context builder
- ranking changes beyond Slice 9

## Slice 11 — Optional Later: Selective `pgvector`

### Goal

Add semantic retrieval only where it clearly helps and volume is manageable.

### Target Surfaces

- `memories.full_content`
- `weddings.story_notes`

### Files

- new migration for embedding columns + HNSW indexes
- embedding backfill worker / RPC
- `searchMemories.ts` hybrid path
- `searchWeddings.ts` hybrid path

### Why This Is Last / Optional

- requires embedding generation + backfill
- adds cost and operational complexity
- most current query failures are lexical, not semantic

### Acceptance Criteria

- only pursue after telemetry proves lexical FTS misses on semantic queries
- hybrid ranking is bounded and explainable

### Not Included

- embeddings on `messages` or `threads`
- prompt-first semantic retrieval
- rerankers / cross-encoders

## Highest-Risk Slices

- **Slice 4** — `messages` FTS
  - largest table
  - `CONCURRENTLY`
  - operationally sensitive

- **Slice 6** — FTS-based corpus-search rewrite
  - first visible search-behavior change

- **Slice 10** — `operator_search` tool + prompt integration
  - prompt/tool behavior has broader blast radius

- **Slice 11** — selective `pgvector`
  - only if justified by telemetry

## Slices That Must Stay Separate

- **Slice 4** must stay separate from Slices 2/3
  - `messages` is a different DDL risk class

- **Slice 5** must stay separate from Slice 6
  - additive helpers first, then rewiring

- **Slice 7** must stay separate
  - it is a tuning change on a different path

- **Slice 8** must stay separate from Slice 6
  - body probe has its own ranking logic and regression surface

- **Slice 9** must stay separate from Slice 10
  - first prove ranker behavior, then expose it to the LLM

- **Slice 11** must stay explicitly optional and late
  - different cost and implementation profile

## First Slice to Implement

**Slice 1 — `pg_trgm` extension + trigram indexes**

Why:

- smallest possible useful unit
- pure schema
- no application behavior risk
- good first validation of the migration path

## Next 3 Slices After That

1. **Slice 2** — FTS on `memories` + `playbook_rules`
2. **Slice 3** — FTS on `weddings` + `threads`
3. **Slice 4** — FTS on `messages`

After Slice 4, the full lexical search/index foundation is in place and code rewrites can begin.

