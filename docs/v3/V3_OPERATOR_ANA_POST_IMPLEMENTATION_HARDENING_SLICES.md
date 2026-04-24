# V3 Operator Ana — Post-Implementation Hardening (Slices)

> **Status:** Ready to implement. Addendum, not a new capability plan.
> **Goal:** Close the remaining real quality gaps found in a senior review of the finished Ana operator domain-first implementation, so the widget moves from "good architecture, mostly shipped" to **premium-grade and reliable**.
> **Category:** Correctness + reliability + test coverage. No new retrieval domains. No persona-writer, real-thread-routing, billing, inquiry-pipeline, or frontend scope.
> **Companion docs (unchanged):**
> - `V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md`
> - `V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md`
> - `V3_OPERATOR_ANA_PROJECT_TYPE_SEMANTICS_SLICE.md`
> - `V3_OPERATOR_ANA_PROJECTS_DOMAIN_FIRST_EXECUTION_SLICE.md`
> - `V3_OPERATOR_ANA_SEARCH_RETRIEVAL_SLICE_PLAN.md`

Do **not** rewrite the historical slice docs. This doc is a focused hardening addendum.

---

## 0. Context

The Ana operator domain-first implementation is substantially complete in the current working tree. Gemini read-only tool parity is implemented and tested. 468 tests pass. The remaining issues are concrete, narrow, and best handled as four short follow-on slices rather than another architecture pass.

Order of execution: **A → B → C**. **D** is cosmetic and optional.

---

## Slice A — Carry-forward completion

**Goal.** Bring the carry-forward pointer to full coverage across the 14 read-only lookup tools, fix the unfocus-to-null drift in the prune step, and widen the topic-shift advisory so it reflects the current domain set.

**Why it matters.** The carry-forward pointer is what makes terse follow-ups ("and when is it?", "why did it escalate?", "what about the draft?") resolve deterministically without re-entity-resolution. Today it writes `lastDomain` for 8 of 14 tools; the remaining 6 fall back to `"none"`, which silently degrades follow-up quality in exactly the lanes the later slices added (corpus, draft, thread-queue, escalation, offer, invoice). The unfocus prune gap also lets a stale `lastFocusedProjectId` survive into turns where the UI is no longer focused on that project.

**Files likely involved.**
- `supabase/functions/_shared/operatorStudioAssistant/operatorAssistantCarryForward.ts`
- `supabase/functions/_shared/operatorStudioAssistant/operatorAssistantCarryForward.test.ts`
- `src/types/operatorAnaCarryForward.types.ts` *(only if a new enum value is required; default is to reuse `threads` for thread-rooted tools and `none` for offer/invoice)*

**Work items.**
1. Extend `DOMAIN_BY_TOOL` to cover the 6 remaining tools:
   - `operator_lookup_corpus` → decide between `"none"` (mixed-domain) and a best-effort mapping based on the top hit; document the choice in a comment.
   - `operator_lookup_draft` → `"threads"`.
   - `operator_lookup_thread_queue` → `"threads"`.
   - `operator_lookup_escalation` → `"threads"`.
   - `operator_lookup_offer_builder` → `"none"` or a new `"offer"` value if the enum is extended.
   - `operator_lookup_invoice_setup` → `"none"` or a new `"invoice"` value if the enum is extended.
2. Extend `mergeToolIntoData` with safe singleton id captures:
   - `operator_lookup_draft` → capture `thread_id` (→ `lastThreadId`) and `wedding_id` (→ `lastFocusedProjectId` + `lastFocusedProjectType` when present).
   - `operator_lookup_thread_queue` → capture the thread id it was called with (→ `lastThreadId`).
   - `operator_lookup_escalation` → capture the thread envelope id (→ `lastThreadId`) and wedding id (→ `lastFocusedProjectId`) when the row resolves a single thread/wedding.
3. Update `inferLlmHandlerUsingPointerHeuristic` so the `threads_lookup_without_project_resolver_with_pointer_ids` branch also recognizes `operator_lookup_draft` / `operator_lookup_thread_queue` / `operator_lookup_escalation` as thread-follow-up calls when the pointer carries a thread id.
4. Extend the `TOPIC_SHIFT` regex to include `escalation`, `draft`, `review`, `offer`, `invoice`, `profile` — mirrors the expanded tool set. Advisory remains **advisory only**, not a gate.
5. Fix unfocus-to-null drift in `pruneCarryForwardData`: when `capturedFocusWeddingId != null && currentFocus.weddingId == null`, clear `lastFocusedProjectId` / `lastFocusedProjectType` (preferred: weaken, don't wipe the full pointer) and return `{ kind: "focus_changed" }` with `advisoryHint.reason: "focus_changed"` so the block renders honestly. Same for `capturedFocusPersonId` vs `currentFocus.personId`.
6. Add regression tests mirroring the existing project/thread tests for each tool added in (1) and (2), and a focused test for unfocus-to-null prune.
7. If `OperatorAnaCarryForwardDomain` is extended with `offer` / `invoice`, update `parseDomain`'s allow-list and `TOPIC_SHIFT` to stay aligned.

**Acceptance criteria.**
- `DOMAIN_BY_TOOL` covers every entry in `OPERATOR_READ_ONLY_LOOKUP_TOOLS` (or explicitly documents why a tool maps to `"none"`).
- `operatorAssistantCarryForward.test.ts` has one passing test per tool for `lastDomain` emission, plus id-capture tests for the draft/queue/escalation branches.
- Unfocus-to-null prune has a passing test that verifies id fields drop and `advisoryHint.reason === "focus_changed"` is emitted.
- `inferLlmHandlerUsingPointerHeuristic` has a test that a draft/queue/escalation call after a prior-turn thread pointer reports `true` with a named `heuristic_note`.
- `parseDomain` accepts every value `DOMAIN_BY_TOOL` can now emit (no silent loss on round-trip).

**Verification.**
- `npx vitest run supabase/functions/_shared/operatorStudioAssistant/operatorAssistantCarryForward.test.ts` all green.
- Full `supabase/functions/_shared/operatorStudioAssistant/` suite remains green.
- Smoke test: run the operator widget with a follow-up after `operator_lookup_escalation` and confirm the outbound `carryForward` payload carries `lastDomain: "threads"` with the right `lastThreadId`.

**Required before premium-quality?** **Yes.**

---

## Slice B — Corpus / query-index test hardening

**Goal.** Add direct unit tests for the two backbone retrieval helpers that drive tenant-wide search and entity resolution. No behavior changes — just cover the logic that is currently only exercised indirectly through LLM tests.

**Why it matters.** `fetchAssistantOperatorCorpusSearch` is ~460 lines of tenant-wide search across five tables plus in-memory playbook / case-exception / invoice matching. `fetchAssistantQueryEntityIndex` feeds the project resolver, the thread resolver, and the corpus search. Both are currently tested only via `operator_lookup_corpus` with a supabase stub that returns empty arrays. Any subtle regression (token sanitization eating `-`, `.or()` filter misformat, dedup key collision, `kind != "other"` lost, deep-mode cap inversion) silently produces wrong answers with no guard.

**Files likely involved.**
- `supabase/functions/_shared/context/fetchAssistantOperatorCorpusSearch.ts` *(no change)*
- `supabase/functions/_shared/context/fetchAssistantOperatorCorpusSearch.test.ts` *(new)*
- `supabase/functions/_shared/context/fetchAssistantQueryEntityIndex.ts` *(no change)*
- `supabase/functions/_shared/context/fetchAssistantQueryEntityIndex.test.ts` *(new)*

**Work items.**
1. `fetchAssistantOperatorCorpusSearch.test.ts` — cover at least:
   - Token extraction + sanitization (min 3 / max 48 chars; strip `%` and `_`).
   - No-token path returns `didRun: true`, empty arrays, and the `no substantive tokens after stopword filter` scope note.
   - Per-column `ilike` against `v_threads_inbox_latest_message` with `kind != "other"` filter applied.
   - Dedupe across `title` / `latest_sender` / `latest_body` columns by thread id.
   - `messageBodyProbeRan` toggles based on `shouldProbeMessageBodiesForCorpusSearch` and respects `probeLimit`.
   - Deep-mode caps exceed normal caps for each surface (threads / projects / memories / offers / playbook / exceptions).
   - `invoiceTemplateMentioned` fires when a token appears in the in-memory invoice blob.
   - `threadHits` sorted newest-first with deterministic tie-break by `threadId`.
2. `fetchAssistantQueryEntityIndex.test.ts` — cover at least:
   - Bounded limits (`ENTITY_WEDDINGS_INDEX_LIMIT`, `ENTITY_PEOPLE_INDEX_LIMIT`).
   - Ordering (`wedding_date` desc + `id` asc; `display_name` asc + `id` asc).
   - Null-field normalization (weddings with no `wedding_date` pass through as `null`).
   - Error propagation on supabase error.

**Acceptance criteria.**
- Two new `.test.ts` files next to the sources. Each file runs in isolation under `npx vitest run`.
- Tests use a chainable supabase stub mirroring the pattern already in `operatorAssistantReadOnlyLookupTools.test.ts`.
- Coverage of both deep and normal modes for corpus; coverage of both weddings and people for the index.

**Verification.**
- `npx vitest run supabase/functions/_shared/context/fetchAssistantOperatorCorpusSearch.test.ts supabase/functions/_shared/context/fetchAssistantQueryEntityIndex.test.ts` all green.
- Existing `supabase/functions/_shared/context/` suite remains green.

**Required before premium-quality?** **Yes.** These are the retrieval backbones — they deserve direct coverage regardless of how well downstream tests look.

---

## Slice C — Lookup-contract consistency

**Goal.** Make the read-only lookup tool contract uniform and honest so the LLM sees the same rules every tool claims, and so `query_too_short` errors stop being surprises.

**Why it matters.** Today the enforced query minimums split 3 vs 4 across semantically similar tools, and three of the older schemas hide the minimum from the model:

| Tool | Enforced min | Schema describes min? |
|---|---|---|
| `operator_lookup_projects` | 4 | No |
| `operator_lookup_corpus` | 4 | No |
| `operator_lookup_threads` | 3 | No |
| `operator_lookup_playbook_rules` | 3 | Yes |
| `operator_lookup_memories` | 3 | Yes |
| `operator_lookup_knowledge` | 4 | Yes |

The model occasionally burns a tool-call budget slot hitting a minimum it was never told about. It also can't reason about when to fall back to a different recovery tool when one rejects.

**Files likely involved.**
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.ts`
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.test.ts`
- *(optional)* `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — the single "Read-only lookup tools (recovery pass …)" prompt paragraph, **only if** a one-line unification phrase makes the tool descriptions simpler.

**Work items.**
1. Decide one policy for minimums. Suggested: **3 chars for keyword/ilike tools** (`operator_lookup_threads`, `operator_lookup_playbook_rules`, `operator_lookup_memories`), **4 chars for phrase/semantic tools** (`operator_lookup_projects`, `operator_lookup_corpus`, `operator_lookup_knowledge`). If a different split is preferred, justify in a comment on `MAX_LOOKUP_TOOL_QUERY_CHARS`.
2. Update the enforced value in the executor for any tool whose current min doesn't match the policy.
3. Update the tool's `description` in `OPERATOR_READ_ONLY_LOOKUP_TOOLS` to state the minimum explicitly — e.g. `"(min 3 characters; max 200)"` — for every tool that accepts a `query`.
4. Finish Slice A's enum/runtime alignment work: if after Slice A any `OperatorAnaCarryForwardDomain` value is still unreachable from both `DOMAIN_BY_TOOL` and `mergeContextOnlySignals`, either delete it or add a one-line comment on why it exists (round-trip compatibility from a past version, etc.).
5. Add a test that asserts each tool description string contains the minimum it enforces (prevents future drift).

**Acceptance criteria.**
- Every `operator_lookup_*` tool with a `query` param states its minimum in the schema description.
- Enforced minimum matches the chosen policy for every tool.
- Regression test in `operatorAssistantReadOnlyLookupTools.test.ts` cross-checks description vs enforced value.
- `OperatorAnaCarryForwardDomain` has no silently dead values after Slice A + this slice.

**Verification.**
- `npx vitest run supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.test.ts` all green.
- Manual prompt check: operator asks a 3-char topic lookup; if enforced min is 4, the tool schema description now makes that rule obvious in the system prompt.

**Required before premium-quality?** **Yes** for items 1–3 (model-visible contract). Items 4–5 are lower urgency but finish the "no dead values / no drift" story and should land with the same slice.

---

## Slice D — Optional Gemini streaming polish

**Goal.** Close the cosmetic gap where Gemini's first pass is not streamed token-by-token when no tools are called, so Gemini-backed operators see the same progressive reveal OpenAI-backed operators already see.

**Why it matters.** **Cosmetic only.** Gemini tool parity is correct; tool outcomes and retrieval are identical to OpenAI. The divergence is that `completeOperatorStudioAssistantLlmStreaming` uses `postGeminiGenerateContentRaw` (non-streaming) for the first pass, and when no function-call parts are returned the full text is replayed in one chunk to the extractor. OpenAI streams the first pass deltas through the extractor live. End users on Gemini see the reply "land" all at once on the common no-tool path.

**Files likely involved.**
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` *(streaming Gemini branch around the first-pass `postGeminiGenerateContentRaw` call)*
- `supabase/functions/_shared/operatorStudioAssistant/operatorStudioAssistantGemini.ts` *(potentially a thin variant that streams while still surfacing `functionCall` parts — Gemini SSE does support tool use)*

**Work items.**
1. Evaluate whether `postGeminiStreamGenerateContentJson` can be adapted to also surface `functionCall` parts, or whether a separate streaming-aware first pass is warranted.
2. If yes, replace the raw first pass with a streamed first pass; detect tool use from SSE deltas; fall back to current behavior on error.
3. If no (Gemini SSE does not expose tool calls cleanly), accept the current approach and update the existing inline comment to make the trade-off explicit ("Gemini first pass is non-streaming because tool-call probing requires the full response body").

**Acceptance criteria.**
- Either Gemini first pass streams tokens in the no-tool case, OR a comment explicitly documents why it doesn't.
- No regression in existing Gemini tests (provider-parity tests, stream second-pass tests).

**Verification.**
- Existing Gemini test suite green.
- Manual: with `ANA_LLM_PROVIDER=google`, a short operator question (no tool call) reveals tokens progressively in the widget.

**Required before premium-quality?** **No.** Ship after A/B/C if desired. Acceptable to defer indefinitely.

---

## Stale findings already resolved in current working tree

Earlier review passes flagged several issues that **are not present** in the current on-disk code. Recorded here so future readers don't re-open them:

- **"Gemini path silently drops all read-only lookup tools (all 11 tools inert on `ANA_LLM_PROVIDER=google`)."** Stale. `operatorStudioAssistantGemini.ts` is now 578 lines with function-call parsing (`extractGeminiFunctionCallsFromResponse`), model-turn synthesis (`geminiModelContentForToolFollowUp`), retry-with-backoff (`postGeminiGenerateContentRaw`), and native SSE streaming (`postGeminiStreamGenerateContentJson`). Both `completeOperatorStudioAssistantLlm` and `completeOperatorStudioAssistantLlmStreaming` perform a real Gemini tool round with the same 14 read-only lookup tools, the same `maxOperatorLookupToolCallsPerTurn` budget, and the same trace/outcomes shape as OpenAI. Provider-parity tests (`provider parity (OpenAI)` and `provider parity (Gemini)` on `operator_lookup_playbook_rules`) cover the round trip. The only remaining provider difference is cosmetic first-pass streaming (see Slice D).

- **"`DOMAIN_BY_TOOL` is only 5 entries."** Stale in wording, still partially real in substance. The current map has **8** entries including `operator_lookup_playbook_rules`, `operator_lookup_memories`, `operator_lookup_knowledge`. Coverage is still incomplete for 6 tools — tracked under **Slice A** above, not as a separate finding.

- **"`focusedProjectFacts` deep push-context block still loaded on focus."** Stale. `buildAssistantContext` now sets `focusedProjectFacts: null` unconditionally; only `focusedProjectSummary` (a pointer) is loaded, and body-meaning queries skip even the orienting thread envelope via `skipThreadPushForBodyIntent`. Domain-first is genuinely in force on the primary lanes.

- **"No explicit audience-tier enforcement on memory retrieval in the operator widget path."** Stale. Operator memory retrieval now passes `replyThreadAudienceTier: "operator_only"` into `fetchSelectedMemoriesFull` and `filterMemoryHeadersForThreadAudienceTier`, so memory scope discipline applies on the widget path.

---

## Sequencing

- **Must-do before premium-quality rollout:** Slice A, Slice B, Slice C.
- **Optional after rollout:** Slice D.
- All four are narrow — each should land as a single PR with a single slice title.
- None of the four modify retrieval semantics in a way that interacts with the persona writer, real-thread routing, billing pipeline, inquiry pipeline, or frontend redesign.
