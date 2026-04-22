# Memories System — Current State, Verdict, and Thread-Analysis Context

**Date:** 2026-04-22
**Scope:** This document is a working memo between the operator (studio owner) and Claude. It captures (a) the current state of the memories subsystem, (b) the outcome of an external architecture review, (c) the confirmed change list going forward, and (d) the lens through which we will analyse real wedding-manager threads in the next step.

**Not a slice plan.** This is context, not an execution packet. No code changes should be made from reading this alone. A proper slice plan comes later, after thread analysis.

---

## 1. Purpose

We are about to analyse real wedding-manager threads (inquiry → delivery) to find issues that the memories subsystem must eventually solve. The threads include:

- Multi-person threads for one wedding (bride, groom, planner, venue, parents, billing contact).
- Planner-only sub-threads that must not be visible to the bride.
- Vendor / brand / commercial inbound that behaves differently from couple inbound.
- Long timelines with decision history, one-off exceptions, shifting preferences.
- Conflicts across threads (something said to the planner contradicts something said to the couple).

Before doing that analysis, we need a fixed map of what the memories system currently is, what its known gaps are, and what we have already decided to change. Otherwise we will rediscover the same gaps in a less structured way.

---

## 2. What the memories system is today (grounded in the repo)

### 2.1 Schema

Single table `memories`. Columns (after all current migrations):

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID PK | |
| `photographer_id` | UUID NOT NULL | Tenant key. RLS scoped to this. |
| `wedding_id` | UUID NULL (FK → `weddings.id`, ON DELETE SET NULL) | When set, memory is project-scoped. NULL = tenant-wide. |
| `type` | TEXT NOT NULL | In practice only `escalation_case_decision` is used today. |
| `title` | TEXT NOT NULL, ≤120 chars on write | |
| `summary` | TEXT NOT NULL, ≤400 chars on write | |
| `full_content` | TEXT NOT NULL, ≤8000 chars on write | |
| `source_escalation_id` | UUID NULL (FK → `escalation_requests.id`, ON DELETE SET NULL) | Learning-loop provenance. |
| `learning_loop_artifact_key` | TEXT NULL | Idempotency key per artifact (e.g. `memory_0`). |
| `created_at` | TIMESTAMPTZ | |

**Indexes:** `idx_memories_photographer_id`, `idx_memories_wedding_id`, and a partial unique index on `(photographer_id, source_escalation_id, learning_loop_artifact_key)` for write-time idempotency.

**RLS:** enabled, policy `photographer_id = auth.uid()`.

**No `person_id` column.** No vector embeddings on this table. No `scope` column (scope is derived implicitly from `wedding_id` being set/unset). No `is_protected`, no `supersedes_memory_id`, no `last_accessed_at`.

### 2.2 Write path

**One live writer:** the Postgres RPC `complete_escalation_resolution_memory(...)`.

- Triggered when an operator resolves an escalation whose `resolution_storage_target = 'memories'`.
- Writes `type='escalation_case_decision'`, plus bounded `title`, `summary`, `full_content` (prefixed with `escalation_request_id: {id}` for traceability).
- Idempotent via the `(source_escalation_id, learning_loop_artifact_key)` unique partial index: repeated calls with same key return the existing row rather than inserting a duplicate.

**What does NOT write memories today:**
- Inbound email triage pipeline (no auto-extraction).
- The client-facing persona / reply writer (never writes memories).
- Onboarding (seeds `knowledge_base` and `playbook_rules`, not `memories`).
- Ana operator widget (can *propose* a memory-note chip, which then writes — but still no staging table, no candidate review step; the write is direct).
- No background job consolidates, expires, or prunes memories.

### 2.3 Read path

**Header scan + deterministic ranking + hydrate top 5:**

1. `fetchMemoryHeaders(...)` — selects `id, wedding_id, type, title, summary` (no `full_content`) for the tenant, optionally filtered to the current wedding. No LIMIT. Returns headers only.
2. `selectRelevantMemoryIdsDeterministic(...)` — ranks headers and picks top 5. Ranking signals (in order):
   - **Scope primary rank:** 2 if `wedding_id` matches current wedding; 1 if NULL (tenant-wide); 0 otherwise.
   - **Provisional text cue:** 2 if concatenated type+title+summary contains `"authorized_exception"` or `"v3_verify_case_note"`; 1 if word-boundary match `\bexception\b`; else 0. (**This is a substring heuristic, not a schema field. Smell.**)
   - **Keyword overlap:** count of 3+ char tokens shared between memory header text and current turn's message + thread summary.
   - Stable lexical ID tiebreaker. Hard-coded `MAX_SELECTED_MEMORIES = 5`.
3. `fetchSelectedMemoriesFull(...)` — loads `full_content` for those 5 IDs.

**Audience gating:**
- **Orchestrator** (operator-facing decision-making): receives all 5 selected memories with `full_content`.
- **Persona writer** (actually writes the client-facing text): receives at most 4 *headers* only, with `summary` truncated to ~200 chars. Does **not** receive `full_content`. This firewall is deliberate and **stays** (see §6).
- **Ana operator widget:** reads memories via the context pipeline today; a dedicated `operator_lookup_memories` tool is planned but not implemented.

### 2.4 Scopes as actually built

Only two scopes exist in the schema:
- **Project-scoped:** `wedding_id` set.
- **Tenant-wide:** `wedding_id` NULL.

**Person-scoped memories are not implemented.** The original design (see V3 design docs) intended a third scope — person across all weddings — but there is no `person_id` column. This is the single biggest gap for cross-wedding recall of planners, vendors, and venues.

### 2.5 Lifecycle

- No soft-delete, no archive flag.
- No TTL, no automatic expiration.
- No consolidation (near-duplicates accumulate).
- No per-tenant or per-project cap.
- Deduplication is narrow: only within the same escalation via the idempotency key. Memory A on Tuesday and memory B on Friday about the same underlying decision will both persist.

### 2.6 Distinction from adjacent grounding stores

Keep these separate by design; the external review asked whether to collapse them, and the answer is **no** — they have distinct purposes. Convention matters more than schema changes here:

| Store | Purpose | Flows into policy? |
|---|---|---|
| `playbook_rules` | Studio-wide authority policy ("always ask before raws"). | Yes — merged via `deriveEffectivePlaybook`. |
| `authorized_case_exceptions` | Scoped policy overrides for one wedding/thread. | Yes — merged via `deriveEffectivePlaybook`. |
| `knowledge_base` | Studio-wide semantic knowledge (SOPs, voice, reusable facts). Vector-searchable (1536-dim). Seeded at onboarding. | No — advisory context. |
| `memories` | Case-specific *episodic* soft facts ("we waived travel for John because he's a friend"). Deterministic retrieval, not vector. | No — advisory context. |
| `thread_summaries` | Rolling session state per thread. Ephemeral. | No. |
| `weddings.story_notes` | Operator-authored freeform narrative per project. Human-edited only. | No. |

**Important:** although the retrieval ranker peeks at `"authorized_exception"` substrings in memory text, memories themselves are **not** merged into the effective playbook. Policy flows exclusively through `authorized_case_exceptions` (a separate table). This was an explicit correction to the external reviewer's "taxonomy disaster / policy backdoor" claim.

---

## 3. Referenced migration and file anchors

Use these as the authoritative references when we reason about what the system actually does today.

### Primary migrations

- `supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql` — original creation of the `memories` table.
- `supabase/migrations/20260423120000_memories_learning_loop_provenance.sql` — added `source_escalation_id`, `learning_loop_artifact_key`, and the partial unique index.
- `supabase/migrations/20260419120000_complete_escalation_resolution_atomic.sql` — defines `complete_escalation_resolution_memory(...)` RPC (the sole live write path).

### Adjacent migrations (for context, not the memory system itself)

- `supabase/migrations/20260430193000_studio_business_profiles.sql` + v2 scope migrations — business profile, separate system.
- `supabase/migrations/20260430200000_finalize_onboarding_briefing_v1.sql` — onboarding RPC, seeds `playbook_rules` and `knowledge_base`, not `memories`.

### Code anchors

- `supabase/functions/_shared/memory/fetchMemoryHeaders.ts` — header scan.
- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts` — ranker with magic-string heuristics.
- `supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts` — top-5 hydration.
- `supabase/functions/_shared/context/buildDecisionContext.ts` — decision-context assembly (client-reply pipeline).
- `supabase/functions/_shared/context/buildAssistantContext.ts` — Ana operator-widget context assembly.
- `supabase/functions/_shared/persona/personaAgent.ts` — client-facing writer; receives only bounded headers, never `full_content`.
- `src/lib/operatorAnaProposalConsumedState.ts` and `SupportAssistantWidget.tsx` — Ana memory-note proposal + confirmation UI.

### Adjacent design docs (prior memory thinking)

- `docs/v3/v3_ANA.md` — layered grounding model.
- `docs/v3/V3_MEMORY_UPGRADE_PLAN.md` — prior upgrade thinking.
- `docs/v3/V3_PRODUCTION_MEMORY_SCOPE_PLAN.md` — prior scope thinking (includes person-scope design that was not built).
- `docs/v3/STIXDB_MEMORY_HYGIENE_ADOPTION_PLAN.md` — prior thinking on hygiene / decay / consolidation.
- `docs/v3/case_memory_promotion_slice_plan.md` — prior case-promotion thinking.
- `docs/v3/V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md` — prior thinking on Ana's retrieval model, including planned `operator_lookup_memories` tool.

These docs overlap and occasionally contradict each other. **This document supersedes them on the specific question of what we plan to change next;** the older docs remain useful as historical thinking.

---

## 4. External architecture review — summary

An external LLM reviewed the memories system (given only prose, no code access). It raised seven lines of critique. Our response after re-checking against the code:

| # | External critique | Our verdict |
|---|---|---|
| 1 | "Taxonomy disaster — memories become backdoor policy via magic-string ranking" | **Wrong on diagnosis.** No policy backdoor exists; `deriveEffectivePlaybook` only merges `authorized_case_exceptions`. **Right on smell:** the magic strings in the ranker should go. |
| 2 | "Read path is an O(N) time bomb" | **Wrong at our scale.** Hundreds of memories per tenant over years; sub-ms indexed scan. Underlying concern about keyword retrieval quality is valid but not urgent. |
| 3 | "Embeddings are not optional" | **Wrong on urgency.** Defer until retrieval misses become measurable. Keep schema trivially extensible (one `ALTER TABLE` later). |
| 4 | "No versioning / mutation — Tuesday X then Friday ¬X leaves both" | **Right.** Cheap schema fix: add `supersedes_memory_id` + `last_accessed_at`. |
| 5 | "Person-scoped memories: nullable intersectional with wedding" | **Right and high-leverage.** Highest single payoff for making Ana a manager. |
| 6 | "Event sourcing with `story_notes` as projection" | **Reject.** Overkill for our scale, misreads the data model (`story_notes` is an unstructured blob, not a projection surface). Observation about overlap is valid; the fix is convention, not architecture. |
| 7 | "Biggest mistake: starving the client writer — lift firewall, rely on prompt rule" | **Reject the proposed fix** — it replaces a structural firewall with a prompt-compliance firewall. **Accept the concern:** fix via summary-writing convention (summaries must encode the *decision*, not just the *topic*), plus optional `is_internal_only` flag if/when needed. |

---

## 5. Confirmed change list (Phase 1 — pending a proper slice plan)

In rough payoff order, to be slice-planned after thread analysis sharpens the requirements.

### Take now (schema + retrieval)

1. **Add `person_id UUID NULL`** (FK → `people.id`, ON DELETE SET NULL) to `memories`. `wedding_id` and `person_id` become independently nullable. Four meaningful combinations:
   - `wedding_id` only → project-scoped (current behavior).
   - `person_id` only → person across all their weddings (new).
   - both → intersectional ("this planner, at this wedding").
   - neither → studio-wide.
2. **Add `supersedes_memory_id UUID NULL`** (self-FK, ON DELETE SET NULL). Enables manual consolidation; old row hidden from ranking once superseded.
3. **Add `last_accessed_at TIMESTAMPTZ NULL`.** Touch whenever a memory reaches top-5 hydration. Foundation for future decay/hygiene without another migration.
4. **Update the ranker** (`selectRelevantMemoryIdsDeterministic`):
   - Drop the `"authorized_exception"` / `"v3_verify_case_note"` substring cues.
   - Extend scope primary rank to handle the four-way combination: prefer exact (wedding+person) > exact wedding > person across weddings > tenant-wide > mismatch.
   - Exclude rows whose `supersedes_memory_id` points to a row that itself is the latest (i.e. never surface a superseded ancestor).
5. **Convention tightening** (not schema): memory summaries must encode the decision/outcome, not just the topic. Enforce at the write site (escalation resolution RPC, Ana proposal flow) where practical.

### Take soon (product)

6. **Operator memory-review UI.** A surface to list, view, and supersede memories. Without this, `supersedes_memory_id` has no human caller. This is a product/UI slice, not a data slice.
7. **Optional `is_internal_only BOOLEAN NOT NULL DEFAULT false`.** Only add if thread analysis reveals concrete cases where operator-private reasoning in a memory could mislead the persona writer. Don't add speculatively.

### Defer explicitly

8. **Embeddings on `memories`.** Add a `vector(1536)` column + ivfflat index only when keyword-overlap misses become measurable. Likely needed once cross-wedding person-scoped memories multiply the candidate pool.
9. **Automated consolidation / decay / pattern mining worker.** Schema above makes it cheap-to-add-later. Don't build until volume warrants.
10. **Inbound auto-extraction into memories.** Currently all memories come from explicit operator resolution. Automatic extraction from conversations is appealing but risks polluting the store. Revisit only after the manual flow is solid and person-scoping exists.

---

## 6. What explicitly stays the same

- **The persona-writer firewall.** Client-facing writer does not receive `full_content` or more than 4 memory headers. This is a structural safety boundary, not a tunable. The fix for the "writer starvation" concern is to enrich summaries, not to lift the firewall.
- **The `authorized_case_exceptions` vs `memories` separation.** Policy flows through exceptions; soft facts stay advisory. No merging memories into effective playbook.
- **The single-writer-per-escalation idempotency model.** Existing unique partial index stays.
- **The `knowledge_base` distinction.** Semantic studio knowledge stays in KB (vector-backed). Episodic case facts stay in memories.
- **`story_notes` stays operator-authored freeform narrative.** Memories stay AI-retrievable structured facts. Two different origin types, two different uses. Do not collapse into one.

---

## 7. What to look for during thread analysis

When real wedding threads are analysed, watch for patterns that either (a) the memory system would solve if it had the Phase 1 changes, or (b) the memory system would not solve even after Phase 1 — meaning a different product decision is needed.

### 7.1 Categories of expected issues

- **Cross-thread context loss.** A fact told to the planner in thread A is relevant to a reply in thread B (same wedding, different participants). Today memories are one-row-per-escalation with wedding scope; this should work if the fact was captured, but it won't be captured unless it went through an escalation.
- **Role-based visibility / privacy.** Something the planner knows must not appear in text addressed to the bride. This is *not* a memory-scope problem per se; it's a **writer-audience awareness** problem. The memory may be correctly retrieved, but the persona writer must know the recipient's role and filter accordingly. Flag these: they point to a gap that is adjacent to but not inside the memory system.
- **Person continuity across weddings.** A planner works three weddings for this studio. Something we learned about her at wedding #1 should inform replies at weddings #2 and #3. **This is the person-scope gap** — Phase 1 change #1 addresses it.
- **Decision-history conflicts.** Tuesday the operator said "no discount," Friday they said "ok, €200 off, once." The second decision supersedes the first. Today both memories persist and ranking is vocabulary-driven. **Phase 1 change #2 (`supersedes_memory_id`) addresses this, but only if captured as distinct memories with an explicit supersede at write time.**
- **Soft-fact vs policy drift.** An operator's one-off decision on one wedding ("let's allow this exception") is being treated by Ana as a rule. This is exactly why memories must never flow into the effective playbook — worth verifying in the threads that we never drift in that direction.
- **Recipient confusion.** The thread has multiple people (bride + groom + planner); replies need to know which of them the last inbound message actually came from. This is a **thread-participant modelling** question, not a memory question — but it determines what memories are relevant.
- **Information-asymmetry leaks.** Ana learns something in planner-only sub-thread and writes something client-facing that reveals it. This is a persona-writer safety concern; the memory firewall addresses one case (full_content never reaches writer) but doesn't address the case where the summary itself contains sensitive information.
- **Vendor / brand / commercial inbound.** Different-shaped threads than couple inbound. Memories from commercial work may be polluting studio-wide retrieval if we're not scoping carefully.
- **Outdated preferences.** What the bride said six months ago in the inquiry no longer reflects her preference today. No decay signal today; `last_accessed_at` alone doesn't solve this, but it's foundational for later decay logic.

### 7.2 Mapping template to use during analysis

For each issue found in a thread, we'll record:

| Field | |
|---|---|
| **Thread excerpt / context** | Minimal quote or paraphrase of what actually happened. |
| **Failure mode** | What went wrong (or would go wrong if the AI were involved). |
| **Which system should own the fix** | Memory / playbook / authorized exception / persona writer / thread participant modelling / UI / product-level. |
| **Does Phase 1 address it?** | Yes / partially / no. |
| **If no, what's missing?** | Specific capability or surface not yet planned. |
| **Severity** | High (manager-grade blocker) / medium / low. |

This mapping is how we'll decide whether the confirmed Phase 1 change list is sufficient, needs tightening, or needs additional items before we write the actual slice plan.

---

## 8. Next step

Once the operator uploads real wedding-manager threads:

1. Read each thread (inquiry → delivery arc, including any sub-threads with planners/vendors/etc.).
2. Use the mapping template in §7.2 to classify each observed issue.
3. Produce a summary: which issues the confirmed Phase 1 plan addresses, which it doesn't, and what (if anything) needs to be added before slicing.
4. Only *then* write a concrete slice plan for the Phase 1 memory changes.

Under no circumstances should code be changed based on this document alone. This is a reading checkpoint, not an execution document.
