# Real-Message Post-Signoff Fix Slices

> Companion docs:
> - [REAL_THREADS_ANALYSIS_AND_PROPOSALS.md](C:/Users/Despot/Desktop/wedding/docs/v3/REAL_THREADS_ANALYSIS_AND_PROPOSALS.md)
> - [REAL_CONVERSATION_STRESS_TEST_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/REAL_CONVERSATION_STRESS_TEST_PLAN.md)
> - [UNFILED_UNRESOLVED_MATCHING_SLICE.md](C:/Users/Despot/Desktop/wedding/docs/v3/UNFILED_UNRESOLVED_MATCHING_SLICE.md)

## Purpose

This doc captures the remaining **current-working-tree** findings from the final senior review of the real-message hardening lane.

This is **not** a new roadmap. The major real-message slices are already implemented. This is a narrow **post-signoff fix addendum** for the items that still block a true "premium-quality" closeout.

The review outcome was:

- the architecture is in strong shape
- several earlier subagent complaints were stale or wrong
- **six** items still deserve execution before calling the lane premium (two blockers, four should-fix)
- **four** lower-risk hardening items can land afterward

A later final pass surfaced **four additional findings (NF1–NF4)** not in the original review. NF1 is a second blocker in the same invariant family as F1. NF2 and NF3 are real should-fix items. NF4 is optional hardening.

## Verified Findings This Doc Covers

These findings were re-checked directly against the **current working tree** after the senior review summary was written.

### Confirmed as real (original pass)

- **F1** is real: the atomic near-match link RPC still lacks a `threads.wedding_id IS NULL` CAS guard.
- **F2** is real: outbound send still has a race window between the fresh pause gate and the atomic draft-claim step.
- **F3** is real: the atomic-link RPC still lacks behavioral/runtime proof and is only regex-checked.
- **F4** is real: Batch-1 replay still calls `detectAuthorityPolicyRisk(...)` without `selectedMemorySummaries`.
- **F6** is real: `capture_occurred_on -> capture_channel` is validator-enforced but not DB-enforced.
- **F7** is real: `memories.audience_source_tier` still relies on policy-layer NULL handling instead of a DB default.

### Confirmed as real (final pass)

- **NF1** is real: `dashboard-resolve-escalation` does **not** require `approve_bounded_near_match_thread_link === true` when the escalation has `action_key = 'request_thread_wedding_link'` + `reason_code = 'bounded_matchmaker_near_match'`. A caller that omits the flag gets routed through the generic learning-loop resolver, which marks the escalation `answered` but **never links the thread** and **never clears the `v3_operator_automation_hold`**. The UI always sets the flag correctly today — but server-side, the invariant is un-enforced. Same failure family as F1, seen from the other direction.
- **NF2** is real: `resolveDeterministicIdentity` silently drops multi-wedding collisions when `distinctWeddings.length > 1` (one sender matches multiple `clients` rows pointing to multiple weddings in the same tenant — the Chanthima / aliased-Gmail case). No log, no trace field, `weddingId` falls back to `null`, operator loses the disambiguation signal.
- **NF3** is real: the two ingress paths (suppressed-email persist and deterministic-human-non-client-ingress persist) do `threads.insert` then `messages.insert` inside one `step.run` with **no idempotency key**. If message insert fails mid-step, Inngest retries the whole step → a duplicate `threads` row is created on retry.

### Confirmed as real but low-probability (final pass)

- **NF4** is real but degrades gracefully: memory supersession is a three-step dance (fetch rows → cycle check → UPDATE) with no `FOR UPDATE` lock or transaction. Two opposing supersessions firing concurrently (`supersede(M1, M2)` and `supersede(M2, M1)` in the same millisecond) can both pass their cycle check and both commit, creating a 2-cycle. The ranker uses direct-pointer exclusion only (`supersededMemoryIdsInHeaderSet`), so the failure mode is "both memories drop from retrieval" — safe-empty, not infinite loop. Audit state is still corrupt.

### Confirmed with nuance

- **F5** is directionally real but slightly overstated in wording:
  - the proof files are still reachable in normal/default Vitest discovery
  - `vitest.context.config.ts` explicitly includes them
  - `vitest.config.ts` does not declare an `include`, but default discovery still finds `*.test.ts`
  - so the operational-hardening concern is real, but not exactly because both configs declare the same explicit include glob

### Required before premium

1. **Atomic near-match link RPC is missing a NULL -> resolved CAS** (F1)
2. **Dashboard edge does not force the bounded-link path for bounded-near-match escalations** (NF1)
3. **Outbound send path still has a narrow pause race window** (F2)
4. **Atomic-link RPC behavior is not runtime-tested** (F3)
5. **Batch-1 stress harness does not exercise authority-via-memory** (F4)
6. **Identity resolver silently drops multi-wedding collisions** (NF2)
7. **Ingress thread+message insert is not idempotent on Inngest retry** (NF3)

### Optional hardening

8. Stress replay/proof files are still inside the default Vitest sweep (F5)
9. `memories.capture_occurred_on` has no SQL CHECK requiring `capture_channel` (F6)
10. `memories.audience_source_tier` relies on policy-layer NULL handling instead of a DB default (F7)
11. Memory supersession is not transactional; opposing concurrent supersessions can create a 2-cycle (NF4)

## Slice 1 - Atomic Near-Match Link CAS + Runtime Proof

### Goal

Make the bounded near-match thread-link approval RPC truly fail-safe:

- only transition `threads.wedding_id` from `NULL` to a resolved wedding
- never silently overwrite an already-linked thread
- prove the real RPC behavior at runtime, not with SQL-text regexes only

### Why this matters

This is the one remaining structural hole in the "atomic link" claim. The transaction is atomic, but today two separate approval escalations on the same thread can still overwrite `threads.wedding_id` serially.

That is not acceptable for the canonical thread-link invariant.

### Findings covered

- Review F1: missing `AND t.wedding_id IS NULL` guard
- Review F3: RPC behavior only regex-tested, not runtime-tested

### Likely files

- `supabase/migrations/20260725120000_complete_bounded_near_match_thread_wedding_link.sql`
- `src/lib/completeBoundedNearMatchThreadWeddingLink.migration.test.ts`
- any wrapper/runtime helper around the RPC if one exists

### Work

1. Add the missing `threads.wedding_id IS NULL` CAS guard to the thread update inside the RPC.
2. On a 0-row thread update caused by the new CAS, return or raise a distinct visible outcome such as:
   - `thread_already_linked`
   - `concurrent_update_detected`
3. Replace the regex-only migration test with a behavioral proof.
4. At minimum, prove:
   - happy-path link succeeds
   - replay of the same escalation is idempotent
   - a second approval on an already-linked thread does not overwrite
   - tenant mismatch / missing wedding still aborts correctly
   - hold-clear remains conditional on the matching escalation id

### Acceptance

- The RPC can no longer silently overwrite a non-null `threads.wedding_id`.
- Idempotent replay still works for the original escalation.
- Runtime tests prove the behavior, not just SQL text presence.

### Verification

- targeted RPC/migration/runtime tests
- `npm run build`

### Required before premium-quality?

**Yes. Blocker.**

## Slice 2 - Dashboard Edge: Force Bounded-Link Path for Bounded-Near-Match Escalations

### Goal

Close the **server-side** policy gap where a `bounded_matchmaker_near_match` escalation can be resolved through the generic learning-loop path instead of the atomic thread-link path — which leaves the thread unlinked and the operator hold stuck.

### Why this matters

This is the second half of the same invariant F1 protects. Today the guard only lives in the React panel ([`EscalationResolutionPanel.tsx:212`](../../src/components/escalations/EscalationResolutionPanel.tsx:212) always sets `approveBoundedNearMatchThreadLink: true`). The edge function **accepts** requests that omit the flag and enqueues a generic resolution job; the worker at [`processEscalationResolutionQueued.ts:139-210`](../../supabase/functions/inngest/functions/processEscalationResolutionQueued.ts:139) then routes through `resolveOperatorEscalationResolution` — which marks escalation `answered` but **never links the thread** and **never clears `v3_operator_automation_hold`**.

Any second resolution surface, future batch tool, direct API caller, or UI regression that forgets the flag will silently leave a bounded escalation "resolved" with its thread unlinked. There is no log that says "bounded escalation resolved via wrong path" — the operator sees "done", the dashboard queue clears, the thread stays in the hold bucket forever.

### Findings covered

- Review **NF1**: `dashboard-resolve-escalation` does not force the bounded-link path for bounded-near-match escalations.

### Likely files

- `supabase/functions/dashboard-resolve-escalation/index.ts`
- `supabase/functions/inngest/functions/processEscalationResolutionQueued.ts` (worker assertion mirror)
- tests for both the edge function and the queued resolution worker

### Work

1. In the edge function, after loading the escalation row and before enqueuing the resolution job, assert:
   ```ts
   if (
     esc.action_key === "request_thread_wedding_link" &&
     esc.reason_code === "bounded_matchmaker_near_match" &&
     !approveBoundedNearMatchThreadLink
   ) {
     return json({ error: "bounded_near_match_must_use_link_path" }, 400);
   }
   ```
   Alternatively, auto-set `approveBoundedNearMatchThreadLink = true` for this reason-code + action-key pair (stricter outcome but safer for legacy callers). Pick one and comment the choice.
2. Add a defense-in-depth mirror in the worker: if `esc.reason_code === 'bounded_matchmaker_near_match'` and `job.approve_bounded_near_match_thread_link !== true`, fail the job with a distinct `last_error` instead of silently routing to the generic resolver.
3. Add tests that prove:
   - request WITHOUT the flag on a bounded escalation is rejected (400) at the edge
   - worker refuses the route mismatch if the edge guard is ever bypassed
   - request WITH the flag on a non-bounded escalation is rejected (existing behavior stays)
4. If either surface rejects, return a recognizable error code so the operator UI can show a useful message, not a generic "failed."

### Acceptance

- A caller cannot close a bounded-near-match escalation without invoking the atomic-link RPC.
- Worker does not run the generic resolver on a bounded reason code, even if the edge is bypassed.
- Tests prove both enforcement points.

### Verification

- targeted edge-function and worker tests
- `npm run build`

### Required before premium-quality?

**Yes. Blocker.** Same invariant family as Slice 1 — fix both or the bounded near-match slice has a hole in either direction.

## Slice 3 - Outbound Pause Claim Race Closure

### Goal

Remove the remaining race window between:

- the fresh wedding-pause gate
- and the actual atomic outbound draft claim/send path

### Why this matters

The current tree is already strong on pause propagation, but the most sensitive surface still has a narrow fail-open window:

- pause is checked in one step
- draft is claimed later in another step
- the claim RPC itself does not re-check wedding pause flags

For compassion pauses, this is the one place that still deserves a stricter boundary.

### Findings covered

- Review F2: outbound pause race between gate and claim

### Likely files

- `supabase/functions/inngest/functions/outbound.ts`
- `supabase/migrations/20260404120000_claim_draft_for_outbound.sql`
- any tests covering outbound claim/send behavior

### Work

1. Move the final fail-closed pause enforcement to the same atomic boundary as the claim.
2. Preferred shape:
   - join `threads -> weddings` in `claim_draft_for_outbound`
   - require `compassion_pause IS DISTINCT FROM TRUE`
   - require `strategic_pause IS DISTINCT FROM TRUE`
3. If the claim is rejected because of pause or unreadable state, return a distinct, debuggable outcome.
4. Add a test proving that a pause flipped between the earlier gate and the claim prevents send/claim success.

### Acceptance

- A draft cannot be claimed for outbound send if the wedding became paused immediately before claim.
- The claim boundary is fail-closed for this condition.
- The race is covered by a focused test.

### Verification

- targeted outbound/pause tests
- `npm run build`

### Required before premium-quality?

**Yes. Should-fix before premium.**

## Slice 4 - Authority-Via-Memory Stress Harness Completion

### Goal

Make the Batch-1 real-stress replay actually exercise the production authority detector path that depends on memory summaries.

### Why this matters

The implementation already supports memory-enriched authority evaluation, but the current Batch-1 harness calls the detector without `selectedMemorySummaries`.

That means some of the most important real-thread authority scenarios are not truly covered by the signoff bundle yet.

### Findings covered

- Review F4: `detectAuthorityPolicyRisk(...)` invoked without `selectedMemorySummaries`

### Likely files

- `supabase/functions/_shared/qa/v3StressReplayBatch1Harness.ts`
- related Batch-1 harness fixtures / decision points
- any helper types used by the harness

### Work

1. Thread `selectedMemorySummaries` through the Batch-1 harness input model.
2. Default it to `[]` so existing cases remain stable.
3. Pass it through `evaluateDecisionPoint(...)` into `detectAuthorityPolicyRisk(...)`.
4. Add at least one memory-driven authority case for:
   - planner/B2B authority refinement
   - budget-cap / authority refinement via stored memory

### Acceptance

- Batch-1 can exercise authority decisions that depend on memory summaries.
- At least one real stress-shaped scenario proves this path.
- The signoff harness better matches the real production authority flow.

### Verification

- targeted Batch-1 harness tests
- signoff bundle rerun
- `npm run build`

### Required before premium-quality?

**Yes. Should-fix before premium.**

## Slice 5 - Identity Resolver Multi-Wedding Collision Observability

### Goal

Make `resolveDeterministicIdentity` **observable** when the same sender email matches multiple weddings in the same tenant, so returning-client aliases, dual-wedding clients (Chanthima Cambodia + Italy), and Gmail alias collisions become visible instead of falling back silently to "unknown sender".

### Why this matters

Today at [`emailIngressClassification.ts:198-207`](../../supabase/functions/_shared/triage/emailIngressClassification.ts:198), when `distinctWeddings.length > 1`, the function returns `weddingId: null` with no log, no trace field, and no operator signal. The email then proceeds as a cold lead and may enter the bounded matchmaker — but the high-signal "this sender is on two weddings in this tenant" fact is lost.

This is exactly P17 from the real-threads doc (email alias / delivery failure) and a common shape of P3 (multi-project person). The lane claims to cover these; the code silently drops the signal.

### Findings covered

- Review **NF2**: identity resolver silently drops multi-wedding collisions.

### Likely files

- `supabase/functions/_shared/triage/emailIngressClassification.ts`
- `supabase/functions/inngest/functions/triage.ts` (consume the new field in `wedding_resolution_trace`)
- any `EmailIngressIdentity` consumer

### Work

1. Extend `EmailIngressIdentity` with:
   - `identityResolveCollisionDetected: boolean`
   - `identityResolveCollisionCandidateWeddingIds: string[]` (bounded, e.g. ≤8)
2. In `resolveDeterministicIdentity`, when `distinctWeddings.length > 1`:
   - emit a structured `console.warn` log line (e.g. `[triage.identity_resolve_collision]`) with sender, candidate wedding ids, tenant — no raw email body.
   - populate the new fields on the returned identity.
3. In `triage.ts`, include `identity_resolve_collision` in `wedding_resolution_trace` across all return paths that call `resolveDeterministicIdentity`.
4. Optional downstream: surface the collision in the operator inbox so the operator can pick the right wedding manually (dashboard work, not required for this slice).
5. Add a unit test that asserts:
   - two `clients` rows pointing to different weddings for the same tenant + sender yield `identityResolveCollisionDetected: true` and `weddingId: null`.
   - log line is emitted with both candidate ids.

### Acceptance

- Multi-wedding collisions are logged and surfaced in `wedding_resolution_trace`.
- Downstream consumers can see the signal even though `weddingId` is null.
- Unit test proves the shape and prevents regression.

### Verification

- targeted identity-resolver tests
- `wedding_resolution_trace` shape tests in triage
- `npm run build`

### Required before premium-quality?

**Yes. Should-fix before premium.** Observability gap is the hole here — the code "works" but the product promise to catch aliasing cases depends on this signal being visible.

## Slice 6 - Ingress Thread+Message Idempotency

### Goal

Make the suppressed-email and deterministic-human-non-client-ingress persist paths idempotent under Inngest step retry, so a transient message-insert failure doesn't leave a duplicate `threads` row.

### Why this matters

Both paths follow the same shape today:

```ts
// inside one step.run:
const { data: thread } = await supabase.from("threads").insert({...}).select("id").single();
const { error: msgErr } = await supabase.from("messages").insert({ thread_id: thread.id, ... });
if (msgErr) throw new Error(...);   // → Inngest retries the whole step
```

If the message insert fails (transient DB error, FK timing, connection reset), Inngest re-runs the entire step. The thread insert runs again and, because there is no natural-key dedup or `idempotency_key`, creates a **second** `threads` row. The operator's unfiled queue can then show the same inbound email as two separate threads.

The Gmail outbound path already has this right — `sendGmailReplyAndInsertMessage` uses `provider_message_id` + `idempotency_key` so retries dedup at the DB level. The ingress paths don't.

### Findings covered

- Review **NF3**: thread + message insert is not idempotent on Inngest retry.

### Likely files

- `supabase/functions/inngest/functions/triage.ts` (suppressed-email persist path, step `persist-suppressed-non-client-email`)
- `supabase/functions/_shared/triage/deterministicOperatorReviewIngress.ts` (`persistDeterministicOperatorReviewIngressThread`)
- a new migration that adds the idempotency column + unique index (if chosen)
- tests covering retry behavior on message insert failure

### Work

Pick **one** of these two shapes (they have the same end-state):

**Option A — single atomic RPC (preferred, mirrors the bounded-link slice pattern):**

1. Add a new service-role RPC `persist_ingress_thread_and_inbound_message(p_tenant_id, p_subject, p_sender, p_body, p_routing_metadata, p_kind, p_wedding_id, p_ingress_fingerprint)` that runs thread-insert + message-insert in a single transaction.
2. Add a short-lived `threads.ingress_fingerprint` column (nullable, tenant-scoped unique partial index on fingerprint when non-null) so retries of the same step upsert the same thread instead of inserting again.
3. Compute `ingress_fingerprint` deterministically (e.g. `sha256(tenant_id + sender_normalized + body_hash + subject_hash + minute_bucket)`) and pass it from both ingress call sites.
4. Rewrite `persist-suppressed-non-client-email` and `persistDeterministicOperatorReviewIngressThread` to call the RPC.

**Option B — app-layer check+insert (cheaper but weaker):**

1. Add `ingress_fingerprint` to `threads` with a unique partial index as above.
2. Before inserting, `SELECT` by `(photographer_id, ingress_fingerprint)`; if found, reuse it. Otherwise insert with the fingerprint. Use `upsert(..., { onConflict: 'photographer_id,ingress_fingerprint' })`.
3. Same fingerprint computation from both call sites.

Either option:

4. Add a test that simulates message-insert failure on first attempt, successful second attempt, and asserts **only one** `threads` row exists.

### Acceptance

- A transient message-insert failure does not leave a duplicate `threads` row after retry.
- Both ingress paths converge on the same idempotency shape.
- Test proves retry safety end-to-end.

### Verification

- targeted triage / deterministic-ingress tests including retry simulation
- migration runtime test for the new fingerprint column + unique index
- `npm run build`

### Required before premium-quality?

**Yes. Should-fix before premium.** Real failure mode, rare in practice, silent when it fires — exactly the class of issue premium rollout should close.

## Slice 7 - Optional Post-Premium Hardening Bundle

### Goal

Land the remaining low-risk cleanup items that improve consistency and reduce future footguns, without changing the core product behavior.

### Findings covered

- Review **F5**: proof files inside default Vitest sweep
- Review **F6**: DB does not enforce `capture_occurred_on -> capture_channel`
- Review **F7**: `memories.audience_source_tier` has no DB default
- Review **NF4**: memory supersession is not transactional; opposing concurrent supersessions can create a 2-cycle (ranker degrades to "both memories hidden" — safe-empty, but audit state is corrupt)

### Likely files

- `vitest.config.ts`
- `vitest.context.config.ts`
- `supabase/migrations/20260723120000_memories_verbal_offline_capture_v1.sql`
- `supabase/migrations/20260724120000_thread_audience_visibility_v1.sql`
- `supabase/functions/_shared/operatorStudioAssistant/supersedeOperatorAssistantMemoryCore.ts` (for NF4)
- optional new migration for a `supersede_memory_atomic` RPC (for NF4)

### Work

1. Decide whether proof files should remain in default Vitest discovery or be excluded so the explicit signoff runner stays authoritative.
   Clarification from code review:
   - `vitest.context.config.ts` explicitly includes the stress/proof files
   - `vitest.config.ts` reaches them through default `*.test.ts` discovery, not an explicit include list
   - the cleanup question is still real: do we want the signoff bundle to remain discoverable everywhere, or only through the dedicated runner?
2. Add:
   - `CHECK (capture_occurred_on IS NULL OR capture_channel IS NOT NULL)` on `memories`
3. Consider:
   - `DEFAULT 'client_visible'` on `memories.audience_source_tier`
4. Close NF4 memory-supersession race (low-probability but structurally weak):
   - Preferred: move the three-step fetch → cycle-check → UPDATE into a single service-role RPC `supersede_memory_atomic(...)` with `FOR UPDATE` on both memory rows and cycle check inside the transaction.
   - Alternative: a deferred CHECK trigger on `memories.supersedes_memory_id` that rejects any insert/update that would close a cycle of length ≤ N.
   - Either way, keep the ranker's direct-pointer exclusion as the safe-empty fallback — don't remove the graceful degradation.

### Acceptance

- No confusion about which tests are "default unit suite" vs "signoff proof suite"
- verbal-capture DB contract is stronger
- audience-tier DB default is explicit if chosen
- supersession cannot produce cycles under concurrent opposing writes

### Verification

- targeted config/migration tests if touched
- concurrency-shaped supersession test that asserts at most one of the two opposing writes wins
- `npm run build`

### Required before premium-quality?

**No.** Good cleanup, but not part of the premium blocker set.

## Execution Order

1. **Slice 1 — Atomic Near-Match Link CAS + Runtime Proof** (F1 + F3)
2. **Slice 2 — Dashboard Edge: Force Bounded-Link Path** (NF1)
3. **Slice 3 — Outbound Pause Claim Race Closure** (F2)
4. **Slice 4 — Authority-Via-Memory Stress Harness Completion** (F4)
5. **Slice 5 — Identity Resolver Multi-Wedding Collision Observability** (NF2)
6. **Slice 6 — Ingress Thread+Message Idempotency** (NF3)
7. **Slice 7 — Optional Post-Premium Hardening Bundle** (F5 + F6 + F7 + NF4)

Slices 1 and 2 should land together (same invariant family). Slices 3–6 are independent and can land in any order. Slice 7 is post-premium.

## Implementation Readiness Note

The direct code scan confirms that the review's **required-before-premium** items are the correct implementation targets:

- **Slice 1** maps to confirmed findings **F1 + F3** (same file, same invariant — CAS + runtime proof)
- **Slice 2** maps to confirmed finding **NF1** (server-side enforcement of the bounded-link invariant)
- **Slice 3** maps to confirmed finding **F2** (outbound pause race)
- **Slice 4** maps to confirmed finding **F4** (stress harness realism)
- **Slice 5** maps to confirmed finding **NF2** (identity collision observability)
- **Slice 6** maps to confirmed finding **NF3** (ingress retry idempotency)

Slice 7 remains worthwhile cleanup, but it is not part of the minimum "structurally premium" closeout path.

## Premium Closeout Rule

Call the real-message lane **premium-quality** only after:

- Slice 1 is done
- Slice 2 is done
- Slice 3 is done
- Slice 4 is done
- Slice 5 is done
- Slice 6 is done

Slice 7 is worthwhile, but not required to claim the core lane is structurally complete.
