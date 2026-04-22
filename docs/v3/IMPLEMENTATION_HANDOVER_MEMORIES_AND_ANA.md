# Implementation Handover — Memories, Ana, and Thread-Analysis Work (v2, expanded)

**Date:** 2026-04-22
**For:** The implementation agent picking up this work chain.
**Status:** Strategic context, schema linkage, concrete integration maps, and acceptance bars per slice. **No code has been changed in this session.** Your job is to draft slice plans from this document and execute them only after the operator confirms.

---

## 0. Critical corrections since the earlier verdict document

The verdict document `MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md` (2026-04-22) described the memory subsystem as minimal — a single table with only `wedding_id` scope and no `person_id`. **That description is out of date.**

Verification against `supabase/migrations/` shows that the following **are already in production**:

- `20260522120000_memories_production_scope_slice1.sql` — added the `memory_scope` enum (`project | person | studio`), `person_id`, `archived_at`, and scope-specific partial indexes.
- `20260523120000_memories_scope_slice3_check.sql` — locked in the scope-shape CHECK constraint, updated the RPCs, removed the Slice 1 default trigger.
- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts` — the ranker has already been extended to handle `scope`, `person_id`, `replyModeParticipantPersonIds`, and a separate `MAX_STUDIO_MEMORIES_IN_REPLY = 3` sub-cap.

**What this means for the Phase 1 plan:**

- The "add `person_id` nullable, intersectional with `wedding_id`" item from the verdict doc is **partially superseded by reality**. `person_id` exists, but it is **not intersectional with `wedding_id`** — there is a CHECK constraint enforcing three mutually-exclusive scopes, not four combinations. This is a deliberate simplification of the original external-reviewer suggestion.
- What remains from Phase 1 is narrower than the verdict document implies: two columns (`supersedes_memory_id`, `last_accessed_at`), two ranker cleanups (drop magic-string cues, exclude archived/superseded), and a write-convention tightening. See §4 for the concrete remaining work.
- **You must decide, in consultation with the operator, whether to preserve the 3-scope design or relax to 4 combinations.** The recommended answer is **preserve the 3-scope design** — reasoning in §4.7.

Treat this handover as authoritative on the current state when it conflicts with any older document. Re-verify against the actual migrations + code before drafting any slice plan.

---

## 1. Reading order

1. This document — for orientation and concrete work.
2. `docs/v3/REAL_THREADS_ANALYSIS_AND_PROPOSALS.md` — for the 20 patterns from 8 real projects and the six-system roadmap.
3. `docs/v3/MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md` — for historical context on the memory decisions, **noting the §0 corrections above**.

Older docs (`v3_ANA.md`, `V3_MEMORY_UPGRADE_PLAN.md`, `V3_PRODUCTION_MEMORY_SCOPE_PLAN.md`, `STIXDB_MEMORY_HYGIENE_ADOPTION_PLAN.md`, `case_memory_promotion_slice_plan.md`, `V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md`) are **historical thinking only** — they are superseded by this handover + the two documents above on points of disagreement.

---

## 2. Product frame (brief)

Photographer + videographer operator CRM. Multi-tenant. `project_type ∈ {wedding, commercial, video, other}`. RLS by `photographer_id` on every table. Two AI paths:

- **Client-facing reply pipeline** (persona writer, Claude-based, strict guardrails).
- **Operator-facing assistant ("Ana")** (gpt-4.1-mini, tool loop, propose-confirm writes only).

Neither is wedding-only. Every Phase 2–3 feature below must respect `project_type` and avoid wedding-specific vocabulary in operator-facing UI and prompts.

---

## 3. Actual current state of the memory subsystem (authoritative)

### 3.1 `memories` table — real shape (post Slice 1 + Slice 3)

**Columns:**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | UUID | PK, default `gen_random_uuid()` | |
| `photographer_id` | UUID | NOT NULL, REFERENCES `photographers(id)` ON DELETE CASCADE | Tenant key. RLS scoped. |
| `wedding_id` | UUID | NULL, REFERENCES `weddings(id)` ON DELETE **SET NULL** | Required when `scope = 'project'`, must be NULL otherwise. |
| `person_id` | UUID | NULL, REFERENCES `people(id)` ON DELETE **CASCADE** | Required when `scope = 'person'`, must be NULL otherwise. **Note CASCADE, not SET NULL.** |
| `scope` | `memory_scope` enum | NOT NULL | `'project' \| 'person' \| 'studio'`. |
| `archived_at` | TIMESTAMPTZ | NULL | Soft-archive. **NULL = active.** Retrieval currently *may or may not* filter on this — verify before assuming. |
| `type` | TEXT | NOT NULL | In practice `escalation_case_decision` today, but not enum-constrained. |
| `title` | TEXT | NOT NULL, clipped to ≤120 chars at write | |
| `summary` | TEXT | NOT NULL, clipped to ≤400 chars at write | |
| `full_content` | TEXT | NOT NULL, clipped to ≤8000 chars at write | |
| `source_escalation_id` | UUID | NULL, REFERENCES `escalation_requests(id)` ON DELETE SET NULL | Learning-loop provenance. |
| `learning_loop_artifact_key` | TEXT | NULL | Idempotency key per artifact. |
| `created_at` | TIMESTAMPTZ | | |

**Scope shape CHECK constraint (`memories_scope_shape_check`):**

```sql
CHECK (
  (scope = 'project' AND wedding_id IS NOT NULL AND person_id IS NULL)
  OR (scope = 'person'  AND person_id IS NOT NULL AND wedding_id IS NULL)
  OR (scope = 'studio'  AND wedding_id IS NULL AND person_id IS NULL)
)
```

**Implication:** there is **no intersectional (wedding+person)** case permitted in the schema today. Memories are strictly mutually-exclusive on scope.

**Indexes (already added):**

- `idx_memories_photographer_id` (photographer_id)
- `idx_memories_wedding_id` (wedding_id)
- `idx_memories_project` (photographer_id, wedding_id) WHERE scope='project'
- `idx_memories_person` (photographer_id, person_id) WHERE scope='person'
- `idx_memories_studio` (photographer_id) WHERE scope='studio'
- Partial unique on (photographer_id, source_escalation_id, learning_loop_artifact_key) WHERE both non-null

**RLS:** `photographer_id = (SELECT auth.uid())` on both USING and WITH CHECK.

**What's still missing from the verdict doc's Phase 1 list:**

- `supersedes_memory_id` UUID NULL (self-FK).
- `last_accessed_at` TIMESTAMPTZ NULL.
- Magic-string ranker cues still present in `selectRelevantMemoriesForDecisionContext.ts` (`authorized_exception`, `v3_verify_case_note`, `exception`).
- Ranker does not explicitly exclude `archived_at IS NOT NULL` rows (verify in `fetchMemoryHeaders`).
- Write-site convention (summary must encode decision, not topic) is not enforced at the RPC.

### 3.2 Write paths today

**Two RPCs (both defined in `20260523120000_memories_scope_slice3_check.sql`):**

1. `public.complete_escalation_resolution_memory(p_photographer_id, p_wedding_id, p_escalation_id, p_title, p_summary, p_full_content, p_learning_outcome) RETURNS uuid`
   - Writes a `type='escalation_case_decision'` memory, scope auto-derived (`project` if `p_wedding_id IS NOT NULL`, else `studio`).
   - Idempotent via the `escalation_request_id:` prefix search in `full_content`.
   - Sets escalation `status='answered'`, `resolution_storage_target='memories'`.
   - SECURITY DEFINER, granted to `service_role` only.

2. `public.complete_learning_loop_operator_resolution(p_photographer_id, p_escalation_id, p_wedding_id, p_thread_id, p_learning_outcome, p_artifacts jsonb) RETURNS jsonb`
   - Multi-artifact RPC that can create `authorized_case_exception` + `memory` + `playbook_rule_candidate` rows from one escalation resolution.
   - Memory artifact accepts `weddingId`, `memoryType`, `title`, `summary`, `fullContent`, `learningLoopArtifactKey`.
   - Idempotent via the unique partial index.
   - SECURITY DEFINER, granted to `service_role` only.

**Both RPCs today hard-code `person_id = NULL`** when creating memories — they only write `project`-scoped or `studio`-scoped rows. **No current path writes `scope='person'` memories.** If you need person-scoped memories to exist, either (a) extend one of these RPCs to accept `person_id`, or (b) add a new write path (see §6.1 Verbal / offline capture workflow, which is the most natural fit).

**What does NOT write memories today:** inbound triage, persona writer, onboarding, background jobs, Ana (the operator widget's "memory note" chip goes through a different RPC — `insert-operator-assistant-memory` edge function, which should itself be verified as tenant-scoped and summary-bounded before the slice).

### 3.3 Read path today

**`fetchMemoryHeaders(supabase, photographerId, weddingId, personId)` in `supabase/functions/_shared/memory/fetchMemoryHeaders.ts`:**

- Returns `MemoryHeader[]` with fields `{id, wedding_id, person_id, scope, type, title, summary}` — no `full_content`, no `archived_at` surfaced.
- **Verify:** does it filter `archived_at IS NULL`? If not, that's a required Phase 1 fix (archived rows leaking into ranking defeats the soft-archive mechanism).
- No LIMIT on the query.

**`selectRelevantMemoryIdsDeterministic(input)` in `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts`:**

Current algorithm (verified by reading the file):

1. **Hard filter** (`isReplyModeSelectableHeader`): cross-project `project` rows excluded; `person` rows included only when `person_id ∈ replyModeParticipantPersonIds`; `studio` rows always candidates.
2. **Scope primary rank** (`scopePrimaryRank`): 2 for in-scope project or in-thread person; 1 for studio with a wedding in scope; 0 otherwise. Superseded/archived not considered.
3. **Provisional text cue rank** (`provisionalTextCueRank`): 2 for substring hit on `authorized_exception` or `v3_verify_case_note`; 1 for word-boundary `\bexception\b`; 0 otherwise. **Remove this step in Phase 1.**
4. **Keyword overlap** (`keywordOverlapScore`): token Jaccard-style count.
5. **Sort descending** by (scopePrimary, provisionalCue, keywordScore), ascending by id.
6. **Cap at `MAX_SELECTED_MEMORIES = 5`** with `MAX_STUDIO_MEMORIES_IN_REPLY = 3` sub-cap when a wedding is in scope.

**`fetchSelectedMemoriesFull(supabase, photographerId, memoryIds[])` in `supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts`:**

- Returns `id, type, title, summary, full_content` for the passed IDs, filtered by `photographer_id`.
- Preserves caller order; omits not-found.

**Audience gating** (these constants must stay — they're the firewall):

- Orchestrator / operator-facing path: receives the 5 hydrated rows with `full_content`.
- Persona writer (`supabase/functions/_shared/persona/personaAgent.ts`): receives at most `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4` **headers** with `summary` truncated to `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200` chars. **Never** `full_content`. This is non-negotiable.

### 3.4 Adjacent tables to understand (enterprise patterns to mirror)

**`authorized_case_exceptions`** (migration `20260416120000_authorized_case_exceptions.sql`):

Enterprise patterns to copy:
- `status TEXT` with CHECK in ('draft', 'active', 'revoked').
- `effective_from TIMESTAMPTZ NOT NULL DEFAULT now()` + `effective_until TIMESTAMPTZ NULL` for time-scoping.
- `approved_by UUID NULL REFERENCES people(id)` + `approved_via_escalation_id UUID NULL REFERENCES escalation_requests(id)` for attribution.
- `override_payload JSONB NOT NULL DEFAULT '{}'::jsonb` for structured machine-mergeable data.
- Indexes: generic + active-window partial.

**`playbook_rule_candidates`** (migration `20260421120000_playbook_rule_candidates_learning_loop.sql`):

**This is the exact template for the `supersedes_memory_id` pattern you will add in Phase 1.** Copy:
- `review_status TEXT NOT NULL DEFAULT 'candidate' CHECK (... IN ('candidate', 'approved', 'rejected', 'superseded'))`.
- `superseded_by_id UUID NULL REFERENCES playbook_rule_candidates(id) ON DELETE SET NULL` — self-FK with SET NULL.
- `promoted_to_playbook_rule_id UUID NULL REFERENCES playbook_rules(id) ON DELETE SET NULL` for later promotion.
- Partial index on the source FK: `WHERE source_escalation_id IS NOT NULL`.

**`thread_summaries`** (same Phase 1 migration as `memories`): rolling session state, not durable memory — do not confuse with memories.

**`knowledge_base`** (migration `20260329084219_add_vector_knowledge_base.sql` + `20260430151000_knowledge_base_rls.sql`): vector-indexed (pgvector 1536-dim) studio-wide semantic knowledge. **Do not add embeddings to `memories` unless the operator explicitly asks for it.** They are different stores by design (episodic vs semantic).

---

## 4. Phase 1 remaining work — concrete

### 4.1 New migration: `supersedes_memory_id` + `last_accessed_at`

**Naming:** follow existing convention — `supabase/migrations/YYYYMMDDhhmmss_memories_supersession_and_access.sql` (or similar).

**Proposed DDL (draft — operator must confirm):**

```sql
-- Phase 1 step: memory supersession + last-accessed tracking.
-- Mirrors playbook_rule_candidates.superseded_by_id pattern.

ALTER TABLE public.memories
  ADD COLUMN supersedes_memory_id UUID NULL REFERENCES public.memories(id) ON DELETE SET NULL,
  ADD COLUMN last_accessed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.memories.supersedes_memory_id IS
  'When set, this row supersedes the referenced older memory. The older row should be filtered out of ranking.';

COMMENT ON COLUMN public.memories.last_accessed_at IS
  'Touched when this memory reaches top-5 hydration. Foundation for future decay/hygiene; not a freshness gate today.';

-- Index for supersession-chain lookup (finding the tip).
CREATE INDEX idx_memories_superseded_tip
  ON public.memories (supersedes_memory_id)
  WHERE supersedes_memory_id IS NOT NULL;
```

**RLS:** no change — existing tenant policy still applies (the new columns inherit the same policy; no new policies needed).

**Rollback:** `ALTER TABLE ... DROP COLUMN ...; DROP INDEX ...`. Trivially reversible because the columns are nullable and have no dependent code in Phase 1.

### 4.2 Ranker cleanup in `selectRelevantMemoriesForDecisionContext.ts`

**Changes:**

1. **Drop the provisional text-cue step** (`provisionalTextCueRank`, `PROVISIONAL_STRONG_SUBSTRINGS`). Remove the substring match entirely. Update the sort to `(scopePrimary, keywordScore, id)` — two tiers, not three.

2. **Exclude superseded memories.** Extend `MemoryHeader` in `fetchMemoryHeaders.ts` to include `supersedes_memory_id: string | null`. In the ranker, compute the set of IDs that are superseded (i.e., present in any other row's `supersedes_memory_id`), and filter them out before ranking. Pure function; testable.

3. **Exclude archived memories.** Verify `fetchMemoryHeaders` filters `archived_at IS NULL`. If not, add `.is("archived_at", null)` to the query. This is the lowest-risk way to honor the existing soft-archive mechanism (already-migrated but not yet fully wired).

4. **Touch `last_accessed_at`.** After `fetchSelectedMemoriesFull` returns, update the 5 hydrated rows' `last_accessed_at = now()`. Do this in a best-effort fire-and-forget pattern — do not block context assembly on the update. Consider a small batch helper `touchMemoryLastAccessed(supabase, ids)` alongside the hydrate function.

**Test coverage required (in `selectRelevantMemoriesForDecisionContext.test.ts`):**

- Superseded chain: `memA` → `memB.supersedes_memory_id = memA`. When ranked, only `memB` appears.
- Deep chain: A ← B ← C. Only C appears.
- Broken chain (if supersedes_memory_id references a deleted row, ON DELETE SET NULL clears it, so it reverts to tip).
- Archived: `archived_at IS NOT NULL` is excluded regardless of other signals.
- No magic-string boost: a memory whose title contains `authorized_exception` does not outrank a keyword-matching memory on that signal alone.

### 4.3 Write-site convention enforcement

Memory summaries must encode the **decision / outcome**, not just the topic. This is the fix for the writer-starvation concern without lifting the persona firewall.

**Enforcement points:**

1. `complete_escalation_resolution_memory` RPC: add a cheap length heuristic or, better, accept a structured `p_decision TEXT` parameter that the RPC concatenates into `summary` with a deterministic prefix (e.g., `Decision: {decision}. Context: {summary}.`). Keep backward-compat by making it optional; log a warning when missing.
2. The `insert-operator-assistant-memory` edge function (verify location): same change — pass through a `decision` field from Ana's proposal and compose it into the summary.
3. System-prompt update for Ana: when Ana proposes a `memory_note`, she must include a decision/outcome field, not just a topic. Update the prompt text and the validator.

**Do not** make this a CHECK constraint on the summary text itself — natural-language validation in SQL is brittle.

### 4.4 Types to update

- `MemoryHeader` in `supabase/functions/_shared/memory/fetchMemoryHeaders.ts` — add `supersedes_memory_id: string | null`, `archived_at: string | null` (if needed for client-side decisions).
- `AssistantContext.selectedMemories` item shape in `src/types/assistantContext.types.ts` if it renders hydrated full content — verify the shape includes the new fields only if the UI or prompt needs them.
- Any TS test fixture that constructs a `MemoryHeader` — add the new fields.

### 4.5 Feature flags

Phase 1 changes are additive and low-risk. **No feature flag needed** for the schema migration itself. The ranker changes can be protected by the operator's deploy process; if you want extra safety, wrap the new "exclude superseded" filter in a small env-gated flag (e.g. `MEMORY_SUPERSEDE_FILTER_ENABLED`) and remove the flag once verified in production for 48 hours.

### 4.6 Observability

Add one JSON log line at the end of each context-build turn:

```json
{
  "type": "memory_retrieval",
  "photographer_id": "...",
  "wedding_id": "...",
  "weddingInScope": true,
  "headersScanned": 42,
  "candidatesAfterFilter": 12,
  "selectedIds": ["...", "..."],
  "studioPickedCount": 1,
  "maxScopePrimaryRank": 2,
  "provisionalCueRankMax": 0,  // drop once magic strings are removed
  "archivedFiltered": 3,
  "supersededFiltered": 1
}
```

Mirrors existing telemetry patterns in `buildAssistantContext.ts` and `buildDecisionContext.ts`. This is how Phase 2 decay / hygiene decisions will be justified later.

### 4.7 Scope shape decision (3 vs 4 combinations)

The verdict document recommended four combinations (including intersectional wedding+person). The current schema enforces three via the `memories_scope_shape_check` CHECK constraint.

**Recommended: preserve 3 mutually-exclusive scopes.** Reasons:

1. It is already implemented, migrated, and the app layer is built around it (`MemoryScope` enum, scope-specific indexes, `isReplyModeSelectableHeader`).
2. The intersectional case ("this planner at this wedding") is rare in the 8 real-thread dataset. Most facts about a planner generalize across weddings (person-scoped); most facts about a wedding are project-level regardless of who's involved.
3. When intersectional facts matter, writing two memories (one project-scoped mentioning the person, one person-scoped mentioning the project) is cleaner and keeps retrieval predictable.
4. Relaxing the CHECK constraint now requires data migration, new index designs, and a ranker rewrite.

**Action:** confirm this decision with the operator before drafting the slice plan. If they prefer 4 combinations, the migration must (a) drop the CHECK, (b) replace with a weaker CHECK that disallows only `wedding_id IS NULL AND person_id IS NULL AND scope != 'studio'` (or similar), (c) add new indexes for the intersectional case, (d) rewrite `scopePrimaryRank` to score intersectional highest. That is a larger slice than what's currently scoped.

---

## 5. Phase 0 — narrow correctness fixes (ship independently)

Each is a small, independent slice. Any can ship first; recommended order is table order (small → larger).

### 5.1 Thread-lookup stop-word fix

**Problem:** Ana retrieved a "Quick question regarding your career / student project" thread when the operator asked about a skincare phone call — because the stop-word list in `src/lib/operatorAssistantThreadMessageLookupIntent.ts` is missing common filler words like `regarding`, `received`, `somebody`, `today`, `maybe`.

**Files to touch:**
- `src/lib/operatorAssistantThreadMessageLookupIntent.ts` (add to `TOPIC_STOP`)
- `supabase/functions/_shared/context/fetchAssistantThreadMessageLookup.ts` (tighten `strong` threshold around lines 220–224)

**Concrete change:**
```ts
// in operatorAssistantThreadMessageLookupIntent.ts TOPIC_STOP constant, add:
regarding received somebody someone anybody anyone
something anything today tomorrow yesterday
maybe probably actually quick question inquiry inquiries
```

```ts
// in fetchAssistantThreadMessageLookup.ts, change strong clause:
// from:
(topicHits >= 1 && signals.recency != null && recencyOk)
// to:
(topicHits >= 2 && signals.recency != null && recencyOk)
```

**Tests:** 12 rows table-driven. The failing "skincare phone call" query must produce `topicKeywords ∈ {skincare, shoot}` (exactly). The "Quick question regarding..." thread must not rank `strong` against that query.

**Size:** ~10 LOC production + ~25 LOC tests. **Ship-ready — fixes a documented real miss.**

### 5.2 Title/body honesty fix

**Problem:** Ana paraphrases thread titles as if they were body summaries ("The email titled 'Brand shoot inquiry...' is about a brand shoot..."). The operator expected body knowledge; got a paraphrase of the subject line.

**Files to touch:**
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` (add a paragraph to `OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT` stating titles are not bodies; must quote verbatim if cited; must point to inbox for body content).
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` (tighten the inline note on the "Recent thread & email activity" block around line 396).

**No schema changes. No new capability.** Pure prompt/format edit.

**Tests:** update the system-prompt golden test. Add one integration test: a query asking "what is the email about?" on a thread with only title-level evidence produces a reply that (a) quotes the title, (b) states the body is not in view, (c) points to the inbox.

**Size:** ~15 LOC + golden. **Ship-ready.**

### 5.3 Ana lightweight triage v1

**Problem:** The six intent predicates scattered across `src/lib/operatorAssistant*Intent.ts` fire independently, producing no single "primary domain" signal. Queries like "how many inquiries today and what was the latest?" fire two predicates without resolution.

**Files to add/touch:**
- **New:** `src/lib/operatorAnaTriage.ts` (~80 LOC) — pure function `classifyOperatorAnaTriage({ queryText, carryForward, focus, entity })` returning `{ primary, secondary, reason }` with 4 domains only: `project_crm | inbox_threads | inquiry_counts | unclear`. Internally calls existing `has*Intent` helpers in a priority ladder (no new regex).
- **New:** `src/lib/operatorAnaTriage.test.ts` (~100 LOC) — table-driven.
- **Edit:** `src/types/assistantContext.types.ts` — add `operatorTriage: OperatorAnaTriage` field.
- **Edit:** `supabase/functions/_shared/context/buildAssistantContext.ts` — one call after `operatorQueryEntityResolution` and `carryForward` are ready; store on returned context; emit telemetry JSON log.
- **Edit:** `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — render a compact Triage block (~6 lines of JSON + 1 header) after "## Operator question."
- **Edit:** `completeOperatorStudioAssistantLlm.ts` — add a ~5-line paragraph to the system prompt explicitly stating the block is a hint, not a gate; user's wording is authoritative.

**Does NOT change:**
- Fetch gates in `buildAssistantContext.ts` (triage is a hint, not a gate — do not touch `loadThreadMessageLookup`, `loadInquiryCount`, etc.).
- Tool `tool_choice` (stays `"auto"`).
- Any of the underlying `has*Intent` helpers.

**Size:** ~200 LOC new + ~25 LOC edits. **Independent of memory work.**

### 5.4 Studio business profile read-only grounding

**Problem:** Ana has **zero** read access to `studio_business_profiles` (the "capability boundary" table that tells her what services the studio offers, what geographies, what deliverables, what languages). She can't answer "do we do video?" correctly unless a playbook rule happens to mention it.

**Files to add/touch:**
- **New:** `supabase/functions/_shared/context/fetchAssistantStudioBusinessProfile.ts` (~80 LOC) — one SELECT mapped to a typed shape.
- **New:** `src/types/assistantContext.types.ts` — add `AssistantStudioProfile` type and `studioProfile: AssistantStudioProfile | null` field.
- **Edit:** `supabase/functions/_shared/context/buildAssistantContext.ts` — one parallel fetch + one settings read (studio_name, manager_name, timezone, currency, base_location.label) + one field store. ~15 LOC.
- **Edit:** `formatAssistantContextForOperatorLlm.ts` — new block formatter ~60 LOC, inserted near the playbook block. Label it explicitly as **capability boundary, not authority**.
- **Edit:** `completeOperatorStudioAssistantLlm.ts` — ~6-line prompt paragraph near the playbook/memory framing.

**Does NOT change:** any write path. No proposal actions for profile changes. The v2 scope canonicals (`core_services`, `service_types`, `deliverable_types`, `extensions`) in the profile table are rendered read-only.

**Tests:**
- Unit: fetcher shape (happy path + missing row + extensions empty).
- Formatter golden.
- One end-to-end: query "do we offer video?" with `core_services = ['photo']` → grounded "no"; with `['photo', 'video']` → grounded "yes".

**Size:** ~405 LOC. **Independent of memory work.**

---

## 6. Phase 2 adjacent systems — architecture maps

Each system below has a detailed integration map. Plan each as a separate slice; do not batch. Draft each slice plan as `docs/v3/PHASE2_<NAME>_SLICE_PLAN.md` for operator approval before implementing.

### 6.1 Verbal / offline capture workflow (HIGHEST leverage)

**Problem:** 6 of 8 real projects lost context to WhatsApp / phone / in-person decisions that never reached email. Ana currently has no write path for "I just agreed to X offline — remember this."

**Shape:** new capability to capture a verbal / offline fact, classify it (memory vs task vs rule candidate vs amendment), and route it to the right durable surface via propose-confirm.

**Tables to add:**

```sql
-- Proposed: verbal_captures (draft)
CREATE TABLE public.verbal_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID NULL REFERENCES public.weddings(id) ON DELETE SET NULL,
  person_id UUID NULL REFERENCES public.people(id) ON DELETE SET NULL,
  thread_id UUID NULL REFERENCES public.threads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'whatsapp', 'instagram_dm', 'in_person', 'zoom', 'other')),
  operator_text TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Classification and promotion
  classified_as TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classified_as IN ('unclassified', 'memory', 'task', 'rule_candidate', 'amendment', 'dismissed')),
  promoted_memory_id UUID NULL REFERENCES public.memories(id) ON DELETE SET NULL,
  promoted_task_id UUID NULL REFERENCES public.tasks(id) ON DELETE SET NULL,
  promoted_candidate_id UUID NULL REFERENCES public.playbook_rule_candidates(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'confirmed', 'dismissed')),
  operator_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**
- `(photographer_id, review_status)` for the operator review queue.
- `(photographer_id, wedding_id)` for project-scoped captures.
- `(photographer_id, captured_at DESC)` for timeline view.

**RLS:** standard `photographer_id = (SELECT auth.uid())` policy on both USING and WITH CHECK.

**RPC for classification + promotion:**

```
public.promote_verbal_capture(
  p_photographer_id uuid,
  p_capture_id uuid,
  p_target TEXT,  -- 'memory' | 'task' | 'rule_candidate' | 'amendment' | 'dismissed'
  p_payload jsonb  -- shape depends on target
) RETURNS jsonb
```

Mirrors the pattern in `complete_learning_loop_operator_resolution` — atomic multi-table write with idempotency.

**Integration with memory:** when `p_target = 'memory'`, the RPC:
1. Inserts into `memories` with appropriate scope (`project` if `wedding_id` present, `person` if `person_id` present, `studio` otherwise).
2. Sets `memories.source_verbal_capture_id` (new nullable column — add in the same slice).
3. Updates `verbal_captures.promoted_memory_id` + `review_status = 'confirmed'`.

**Ana integration (frontend):**
- New proposedAction kind: `"verbal_capture"` with `{ channel, summary, ... }` fields.
- New chip in `SupportAssistantWidget.tsx` that calls a new edge function `insert-operator-verbal-capture`.
- After capture, Ana proposes classification via a second chip ("This sounds like a memory about [person] — save?").

**Dependencies on Phase 1:** requires `memories.supersedes_memory_id` to exist if the capture is a supersession of a prior memory. Phase 1 must land first (or in same batch).

**Estimated size:** migration ~120 LOC + RPC ~200 LOC + types + edge function + Ana widget extension + tests. **Largest Phase 2 slice.** Draft a detailed slice plan before touching code.

### 6.2 Thread participant + audience / visibility model

**Problem:** Planner-tier threads can contain facts that must not appear in couple-tier replies. Current `thread_participants` table has no role or audience metadata.

**Verify first:** check `thread_participants` current columns (probably just `thread_id`, `person_id`, `visibility_role`, `is_sender`, `is_recipient`, `is_cc` per the earlier mapping).

**Extend:**

```sql
ALTER TABLE public.thread_participants
  ADD COLUMN role TEXT NOT NULL DEFAULT 'other'
    CHECK (role IN ('couple', 'planner', 'venue', 'vendor', 'family', 'assistant', 'operator_internal', 'other'));

ALTER TABLE public.threads
  ADD COLUMN audience_tier TEXT NOT NULL DEFAULT 'client_facing'
    CHECK (audience_tier IN ('client_facing', 'planner_tier', 'operator_internal'));
```

**Integration with memory:** add an optional `audience_tier` tag on memories when they're written from a verbal capture or escalation on a specific-tier thread. Memory retrieval can then prefer matching-or-broader-audience memories when drafting a client-tier reply.

**Integration with persona writer:** the writer's memory-header input gets filtered by audience tier. A `planner_tier`-sourced memory would produce a subtle warning in the writer's context that "this fact comes from a planner-only thread; do not surface details to the couple unless they initiated mention."

**Size:** migration ~30 LOC + ranker extension ~40 LOC + persona-writer gate ~20 LOC + tests. Medium slice.

### 6.3 Inquiry dedup / entity resolution on intake

**Problem:** J&A and P&R projects showed the same wedding entering via planner and couple separately, producing two different quotes. No current dedup on intake.

**Shape:** deterministic matching function applied to every new inbound thread or inquiry form submission:
- Client names (fuzzy match to recent `weddings.couple_names` + `people.display_name`).
- Event date proximity (±7 days on `weddings.wedding_date`).
- Venue match (substring on `weddings.location`).
- Planner email domain match.
- Score threshold → surface "this looks like project X, link or treat as new?" in the operator review queue.

**New table:**
```sql
CREATE TABLE public.inquiry_dedup_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  new_inquiry_source TEXT NOT NULL,  -- 'email_thread' | 'web_form' | 'manual'
  new_inquiry_ref UUID NOT NULL,  -- thread_id or form submission id
  existing_wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  match_score REAL NOT NULL CHECK (match_score >= 0 AND match_score <= 1),
  match_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'linked', 'kept_separate', 'dismissed')),
  linked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**No direct memory integration needed** — this runs on intake, before memories come into play.

**Size:** matching algorithm + one migration + operator review UI. Medium-large slice.

### 6.4 Life-event pause propagation

**Problem:** Crises on either side (operator's family emergency, client's housing crisis) need to suspend all automated nudges for a defined window. No current flag.

**Verify first:** check `thread_workflow_state` (per earlier mapping) and `weddings` for any existing pause flags. Likely `weddings` has none; `thread_workflow_state` has `compassion_pause` per the catalog mention.

**Most likely shape:** extend `weddings` (project-level) rather than per-thread:

```sql
ALTER TABLE public.weddings
  ADD COLUMN compassion_pause_until TIMESTAMPTZ NULL,
  ADD COLUMN compassion_reason TEXT NULL,
  ADD COLUMN compassion_scope TEXT NULL
    CHECK (compassion_scope IS NULL OR compassion_scope IN ('this_project', 'this_person', 'this_studio'));
```

**Integration with automations:** every place that sends an automated nudge or AI-drafted client reply must gate on:

```sql
WHERE w.compassion_pause_until IS NULL OR w.compassion_pause_until < now()
```

List these gates explicitly in the slice plan — miss one and the pause leaks.

**Memory integration:** memory retrieval surfaces an active pause at the top of context with `scope_primary_rank = 3` (higher than any other) so Ana sees it on every turn.

**Size:** small — one migration + a half-dozen gate checks + tests.

### 6.5 Billing separation workflow

**Problem:** Payer ≠ user is everywhere. `wedding_people` already has `is_billing_contact`, `is_payer`, `is_approval_contact` flags — the gap is workflow.

**No new tables needed.**

**Workflow change:** at contract-accept time, Ana proposes a billing-contact capture chip. The chip writes to `wedding_people.is_billing_contact = true` plus optional `billing_entity_name`, `billing_address`, `billing_currency` on `wedding_people` (new columns to add). Subsequent invoice generation reads from `wedding_people` where `is_billing_contact = true`.

**Memory integration:** a billing-routing change ("Chanthima's Cambodian bank blocked Serbia transfers; use UK account") is written as a person-scoped memory alongside the `wedding_people` update. Phase 1 `supersedes_memory_id` handles later routing changes.

**Size:** ~40 LOC migration + workflow wiring + Ana chip extensions.

### 6.6 Contract amendment / scope-change data model

**Problem:** Soft commitments ("up to 2h brunch") never become binding amendments. Upsells accepted verbally or in email chat without addendum.

**New table:**

```sql
CREATE TABLE public.project_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL
    CHECK (change_type IN ('pricing', 'scope_add', 'scope_remove', 'timeline_change', 'team_change', 'payment_schedule_change', 'other')),
  old_value JSONB NULL,
  new_value JSONB NOT NULL,
  rationale TEXT NULL,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('email', 'verbal_capture', 'manual')),
  source_email_message_id UUID NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  source_verbal_capture_id UUID NULL REFERENCES public.verbal_captures(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'operator_confirmed', 'client_confirmed', 'superseded', 'withdrawn')),
  effective_from TIMESTAMPTZ NULL,
  effective_until TIMESTAMPTZ NULL,
  superseded_by_id UUID NULL REFERENCES public.project_amendments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Integration with memory:** an amendment is not a memory — it's binding. However, a memory may *reference* an amendment in its `full_content` for retrieval purposes. Do not duplicate amendment content into memory summaries.

**Integration with invoicing:** any future invoice should join `project_amendments` where `status = 'operator_confirmed'` AND `effective_from <= now() AND (effective_until IS NULL OR effective_until > now())` to resolve current scope.

**Dependencies:** `verbal_captures` (§6.1) should exist before this slice, since many amendments originate from verbal captures.

**Size:** migration + RPC + Ana propose-confirm integration. Medium-large.

---

## 7. Architectural red lines (enterprise contract)

Non-negotiable principles. Each has a concrete code-level implication.

1. **Tenant isolation.** Every new table has `photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE`. Every new query filters by it explicitly. Every new RLS policy is `USING (photographer_id = (SELECT auth.uid())) WITH CHECK (photographer_id = (SELECT auth.uid()))`. Zero exceptions. **Verify by RLS test** (insert as tenant A, select as tenant B, expect empty result).
2. **Client-facing firewall.** `personaAgent.ts` must continue to receive at most `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4` headers, `summary` truncated to `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200` chars. Never `full_content`. If a Phase 2 change adds new fields to memories, the persona-writer input shape must not acquire them without an explicit architectural review.
3. **Authority vs advisory.** `playbook_rules` and `authorized_case_exceptions` → merged by `deriveEffectivePlaybook`. `memories` → never merged. Any proposal to "promote a memory to policy" goes through `playbook_rule_candidates` (already the pattern), not through a direct memory-to-playbook path.
4. **Propose-confirm for risky state.** Rules, memories, case exceptions, amendments, policy changes, financial-field edits flow through the chip pattern (`proposedActions` + confirmation click). Direct writes allowed only for safe, reversible operations (task create/complete, calendar create/edit with approval chip, memory note already confirmed).
5. **Store separation.** Do not collapse `memories`, `knowledge_base`, `playbook_rules`, `authorized_case_exceptions`, `thread_summaries`, `story_notes`, `weddings.story_notes`. They are distinct by purpose. Clarify convention, not schema.
6. **Idempotency.** Every write RPC that accepts client-supplied data must be idempotent. Follow `complete_escalation_resolution_memory` pattern: SELECT before INSERT, unique partial index where applicable, RETURN existing row on replay. The `learning_loop_artifact_key` convention exists — re-use it.
7. **Single idempotency on memories stays.** The existing partial unique index on `(photographer_id, source_escalation_id, learning_loop_artifact_key) WHERE both non-null` stays. Do not remove or relax.
8. **PII never in memory content.** If a pattern suggests extracting PII into memories, redirect to a dedicated sensitive-document store (§6g of `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md`).
9. **No wedding-only design.** Every schema addition, type, and UI surface uses `project_type` abstractions. Planner → coordinator in generic labels. Couple → primary_client where generic. Verify by: "if this feature were used by a commercial photographer, would the language still fit?"
10. **No multi-agent orchestration for Ana.** Single model per turn. Specialist modes may use different models / prompts / tools, but not sub-agents fanning out.
11. **No LLM classifier on Ana's fast path.** Deterministic rules first. Only consider a classifier on `unclear` triage, with ≤600ms timeout and fallback, and only after telemetry justifies it.
12. **Audit everything.** Every state-changing RPC logs a JSON line with `photographer_id`, operation type, affected IDs, and outcome. Mirror existing patterns.

---

## 8. Non-functional requirements (enterprise grade)

### 8.1 Migration naming and ordering

- Format: `YYYYMMDDhhmmss_<slug>.sql` — lexicographic order matches apply order.
- Always forward-compatible: new columns nullable with defaults; new tables empty.
- Destructive operations (DROP COLUMN, DROP CONSTRAINT) are almost always wrong in this codebase; propose them only with an explicit migration rationale and the operator's sign-off.
- For any Phase 2 migration, include a rollback script as a comment at the top (not a separate migration).

### 8.2 RLS verification checklist

For every new table:
- [ ] `photographer_id` column exists and is `NOT NULL`.
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- [ ] At least one `CREATE POLICY ... FOR ALL USING (photographer_id = (SELECT auth.uid())) WITH CHECK (...)` statement.
- [ ] Test: insert as tenant A, select as tenant B → empty.
- [ ] Test: insert as tenant A, insert as tenant A trying to reference tenant B's row → fail.
- [ ] Any RPC that reads this table is either `SECURITY DEFINER` with internal tenant checks, or `SECURITY INVOKER` (preferred — lets RLS do the work).

### 8.3 Idempotency verification checklist

For every new write RPC:
- [ ] Define a deterministic idempotency key from the input.
- [ ] Either a partial unique index OR a SELECT-before-INSERT pattern.
- [ ] Repeated calls return the same result (same IDs, same status).
- [ ] Test: call RPC twice with same input; expect identical output, one row in the target table.

### 8.4 Observability — structured JSON logs

Every RPC and every context builder emits one JSON line per invocation:

```json
{
  "type": "<operation_name>",
  "photographer_id": "...",
  "fingerprint": "...",  // short deterministic hash of input
  // ... operation-specific fields
  "outcome": "ok" | "already_completed" | "error",
  "error_detail": "..."  // only on error
}
```

The `fingerprint` lets ops correlate retries and measure latency without exposing PII. Existing pattern: see `queryTextFingerprint` in `buildAssistantContext.ts`.

### 8.5 Error taxonomy

- `tenant_mismatch` — input refers to a resource not owned by the caller tenant. Return 403 at the edge-function layer.
- `validation_error` — input shape wrong. Return 400 with `{ code, message }`.
- `not_found` — referenced resource absent. Return 404 with diagnostic.
- `idempotent_replay` — recognised retry; return the existing resource. 200.
- `concurrent_update` — row changed mid-write. Return 409 with retry hint.
- `internal_error` — catch-all. 500 with fingerprint for log correlation.

Use these consistently across edge functions and RPCs.

### 8.6 Rollback posture

Phase 1 and all Phase 0 items are **trivially reversible**: columns are nullable, behaviour is additive, tests pass without them. Phase 2 items are reversible but may strand data (e.g., verbal captures) if withdrawn — include a rollback plan in each slice plan.

---

## 9. Per-slice workflow

For every slice you pick up:

1. **Re-verify the current state.** Read the actual migration files + source code. Do not trust this handover over reality if they differ (flag the drift to the operator).
2. **Draft a slice plan** as a new `docs/v3/SLICE_<PHASE>_<NAME>_PLAN.md` using the template in §10.
3. **Present to the operator** for approval. Wait.
4. **Execute** exactly the approved scope. If scope creep becomes necessary, stop and re-propose.
5. **Run the full verification checklist** (§11).
6. **Write a short post-ship summary** mapping the slice to patterns from `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md` it addresses, with any follow-ups surfaced.
7. **Do not open new work without operator confirmation.**

---

## 10. Slice plan template

Every slice plan follows this skeleton:

```markdown
# Slice Plan — <name>

## 1. Problem statement (1 paragraph, grounded in real evidence)

## 2. Scope
### In scope
- ...
### Out of scope (explicit)
- ...

## 3. Pattern mapping
Which patterns from `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md` this slice closes (fully / partially / not at all).

## 4. File-by-file change surface
| File | Change | Est. LOC |
|---|---|---|
| path/to/file.ts | ... | ~50 |

## 5. Schema changes (if any)
- Migration filename: `YYYYMMDDhhmmss_<slug>.sql`
- Full DDL.
- Rollback DDL (as comment).
- RLS policy.
- Indexes.

## 6. Write path contract (if any)
- RPC signature.
- Idempotency key definition.
- Error codes.
- Transaction boundary.

## 7. Read path integration (if any)
- Which existing context builders extend.
- Which TS types change.
- Telemetry fields added.

## 8. Test strategy
- Unit tests (list).
- Integration tests (list).
- Golden tests (list).
- Manual verification steps.

## 9. Acceptance criteria (observable)
- ...

## 10. Red-line compliance
Explicitly answer: does this respect §7 of the handover?
- Tenant isolation: how verified.
- Firewall intact: yes / explain change.
- Propose-confirm honored: yes / explain.
- Store separation: yes / explain.
- etc.

## 11. Risks and unknowns
- ...

## 12. Rollback plan
- ...

## 13. Estimated effort
- Schema: X LOC
- Application code: Y LOC
- Tests: Z LOC
- Total: ~N LOC
```

---

## 11. Verification checklist per slice

Before calling a slice done:

- [ ] All new tables have RLS enabled + tenant isolation policy + verified by test.
- [ ] All new columns on existing tables preserve RLS behaviour (no accidental opening of access).
- [ ] All new RPCs are `SECURITY DEFINER` with explicit tenant checks, OR `SECURITY INVOKER` letting RLS do the work. Documented which.
- [ ] All new RPCs are idempotent and verified by test.
- [ ] All new write paths emit structured JSON telemetry.
- [ ] All new schema changes are additive or clearly documented as destructive-with-rationale.
- [ ] All new UI surfaces respect the `project_type` abstraction and avoid wedding-only vocabulary.
- [ ] The persona-writer firewall is still intact (`PERSONA_LIMITED_CONTINUITY_HEADER_MAX` + `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT` unchanged, no new paths to `full_content`).
- [ ] No new code reads across tenants.
- [ ] No new memory-write path bypasses the `photographer_id` check.
- [ ] No new code merges memory content into effective playbook.
- [ ] Tests at all three levels (unit / integration / golden) cover the happy path and at least two failure paths per new capability.
- [ ] Migration is reversible (or rollback documented).
- [ ] One-line summary written matching slice plan §3 (pattern mapping).

---

## 12. Explicit do-nots

- **Do not** extend the `memories.type` text field with ad-hoc new values without enum-izing or constraining it. Today it's unstructured; a growing vocabulary without structure becomes the next magic-string ranker problem.
- **Do not** allow intersectional wedding+person memories without an explicit operator decision to relax the `memories_scope_shape_check` CHECK constraint (see §4.7).
- **Do not** add `embedding` column to `memories` in Phase 1 or Phase 2. Vector search on memories is a Phase 3+ decision, gated on measured retrieval misses.
- **Do not** lift the persona-writer firewall. Fix writer starvation via summary convention (§4.3).
- **Do not** add an LLM triage classifier in the Ana triage v1 slice. Deterministic only.
- **Do not** add fetch-gating to Ana triage v1. Keep existing boolean gates in `buildAssistantContext.ts` untouched — triage is a hint.
- **Do not** treat this handover as sufficient to begin code changes. Every slice needs a plan drafted under `docs/v3/` and approved by the operator first.
- **Do not** collapse `memories` and `story_notes`, or `memories` and `knowledge_base`, or `memories` and `playbook_rules`. They are intentionally separate.
- **Do not** auto-extract facts from inbound messages into `memories` in Phase 2. All memories still come from explicit operator action until verbal-capture (§6.1) ships and has produced clean data for several months.
- **Do not** write any memory with `full_content` that contains PII (passports, national IDs, full DOBs combined with names). Redirect to sensitive-document store when ready (§6g of thread-analysis doc) or refuse + flag.
- **Do not** write a memory from the persona writer. Persona writer is read-only on memory.
- **Do not** allow a memory to merge into effective policy. Ever.

---

## 13. Communication pattern with the operator

- **Diagnostic before design.** The operator does not want speculative solutions; they want evidence-grounded plans. Every recommendation must cite a file path, a line number, or a concrete thread/project as evidence.
- **Small slices.** Two smaller slices are always preferred over one larger one. If a slice exceeds ~500 LOC of meaningful change, consider splitting.
- **Explicit "not now" distinctions.** The operator will say "do not implement yet" frequently. Respect it. The agent's job is to plan and document, not to run ahead.
- **Skepticism toward external LLM critique.** When a review from another agent comes in, read it skeptically — not as ground truth, not dismissed wholesale. The verdict document has a good example (7 critiques → 4 accepted, 3 rejected with reasoning).
- **End-of-slice summary.** After each slice lands, write a short summary: (1) what changed, (2) which patterns from the thread-analysis doc this closes, (3) what was surfaced for follow-up.
- **Push back on over-engineering.** If a design is drifting toward multi-agent orchestration, event sourcing, premature optimisation, or a speculative capability that nothing in the thread-analysis demands, call it out and propose the smaller version.

---

## 14. Quick-reference appendix

### 14.1 Current file inventory (verified 2026-04-22)

**Memory subsystem:**
- `supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql` — original `memories` table.
- `supabase/migrations/20260423120000_memories_learning_loop_provenance.sql` — `source_escalation_id`, `learning_loop_artifact_key`, partial unique index.
- `supabase/migrations/20260522120000_memories_production_scope_slice1.sql` — `scope` enum, `person_id`, `archived_at`, partial indexes.
- `supabase/migrations/20260523120000_memories_scope_slice3_check.sql` — scope CHECK, updated RPCs, dropped Slice 1 trigger.
- `supabase/functions/_shared/memory/fetchMemoryHeaders.ts` — header scan (**verify archived_at filter**).
- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts` — ranker (**magic strings still present, to remove in Phase 1**).
- `supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts` — top-5 hydration.

**Memory write paths:**
- RPC `public.complete_escalation_resolution_memory(...)`
- RPC `public.complete_learning_loop_operator_resolution(...)`
- Edge function `insert-operator-assistant-memory` (Ana memory-note chip — verify location and tenant scoping)

**Ana:**
- `src/components/SupportAssistantWidget.tsx`
- `src/lib/operatorStudioAssistantStreamClient.ts`
- `src/lib/operatorAnaStreamSmoothReveal.ts`
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — LLM + system prompt.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — context formatter.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.ts` — tool definitions + handlers.
- `supabase/functions/_shared/operatorStudioAssistant/operatorStudioAssistantSseResponse.ts` — SSE transport.
- `supabase/functions/_shared/operatorStudioAssistant/operatorAssistantCarryForward.ts` — carry-forward pointer.

**Context builders:**
- `supabase/functions/_shared/context/buildAssistantContext.ts` — Ana.
- `supabase/functions/_shared/context/buildDecisionContext.ts` — client-reply.
- `supabase/functions/_shared/context/fetchAssistantThreadMessageLookup.ts` — thread retrieval.

**Intent predicates (consolidated by Ana triage v1):**
- `src/lib/operatorAssistantThreadMessageLookupIntent.ts`
- `src/lib/operatorAssistantInquiryCountIntent.ts`
- `src/lib/operatorAssistantAppHelpIntent.ts`
- `src/lib/operatorAssistantStudioAnalysisIntent.ts`
- `src/lib/operatorAssistantCalendarScheduleIntent.ts`

**Studio business profile:**
- `src/types/photographerSettings.types.ts`
- `src/lib/photographerSettings.ts`
- Migrations `20260430193000` → `20260506000000` (scope v2 + geography contract + finalize RPC).

**Persona writer (firewall):**
- `supabase/functions/_shared/persona/personaAgent.ts` — constants `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4`, `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200`. Do not increase these.

### 14.2 Key types

- `AssistantContext` — `src/types/assistantContext.types.ts`
- `MemoryHeader`, `MemoryScope` — `supabase/functions/_shared/memory/fetchMemoryHeaders.ts`
- `OperatorAnaCarryForwardForLlm` — `src/types/operatorAnaCarryForward.types.ts`
- `OperatorStudioAssistantAssistantDisplay` — `src/lib/operatorStudioAssistantWidgetResult.ts`

### 14.3 Key constants

- `MAX_SELECTED_MEMORIES = 5` (ranker total cap)
- `MAX_STUDIO_MEMORIES_IN_REPLY = 3` (studio sub-cap within the total when wedding in scope)
- `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4` (firewall)
- `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200` (firewall)
- Memory field clips: title ≤120, summary ≤400, full_content ≤8000
- `memory_scope` enum: `'project' | 'person' | 'studio'` — three, not four.

### 14.4 Key tests to update

- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.test.ts`
- System-prompt golden test (if exists) for Ana.
- `src/components/SupportAssistantWidget.streaming.test.tsx`
- `src/lib/operatorAnaStreamSmoothReveal.test.ts`
- `src/lib/operatorAssistantThreadMessageLookupIntent.test.ts`

### 14.5 Starting point — concrete first move

When you are ready to begin:

1. **Read this document end-to-end.**
2. **Verify** the current state by reading:
   - The two 2026-05-22 and 2026-05-23 memory migrations.
   - The current `selectRelevantMemoriesForDecisionContext.ts` source.
   - The current `fetchMemoryHeaders.ts` source (confirm whether `archived_at` is filtered).
3. **Read `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md`** for patterns to address.
4. **Choose the smallest Phase 0 item** (recommended: §5.1 thread-lookup stop-word fix — smallest, safest, fixes a real observed miss, independent of everything else).
5. **Draft a slice plan** under `docs/v3/SLICE_PHASE0_THREAD_STOPWORD_PLAN.md` using §10's template.
6. **Present to the operator.** Wait for approval.
7. **Execute.**
8. **Verify** using §11's checklist.
9. **Report.**
10. **Do not batch or jump ahead.** Each slice its own plan, its own approval, its own execution.

The operator has invested significant effort getting diagnosis right. Preserve that discipline in execution. When in doubt, ask.

---

## 15. Document maintenance

- Last verified against code: **2026-04-22**.
- If any of the file paths, column names, or RPCs named in §14 have drifted, update this document in the same commit as the slice plan that discovered the drift.
- Migrations dated after 2026-04-22 supersede this document's "current state" on those specific points; this document is always a snapshot, never the source of truth on schema.
