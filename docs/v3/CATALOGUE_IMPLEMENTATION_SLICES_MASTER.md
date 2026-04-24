# Catalogue Implementation Slices Master

## Purpose

This is the implementation bridge between the large catalogue and actual worker-safe coding slices.

Use this document to decide:

- what the current authoritative source files are
- which issues are the true product-correctness floor
- which slices may be run in parallel
- which review-worktree findings must not get lost even if they are not yet catalogued
- which order vibecoder workers should follow after the floor is stable

This document is deliberately narrower than the catalogue itself.

The catalogue is the backlog.

This file is the execution plan.

## Canonical source map

### Primary backlog

- `C:\Users\Despot\Desktop\wedding\docs\v3\SMALL_UNPREDICTABLE_BUGS_CATALOG.md`

This is the master issue catalogue.

Important note:

- the file contains dense inline issue references, grouped bundles, suffix sub-issues, and later appended sections
- do not estimate scope from heading counts alone
- for implementation planning, treat the later execution sections as the active spine

### Tactical review backlog

- `C:\Users\Despot\Desktop\wedding\.claude\worktrees\jovial-colden-335a4e\CODE_REVIEW_FINDINGS.md`

### Related review-worktree artifacts

- `C:\Users\Despot\Desktop\wedding\.claude\worktrees\jovial-colden-335a4e\CODE_REVIEW_REPAIR_PLAN.md`
- `C:\Users\Despot\Desktop\wedding\.claude\worktrees\jovial-colden-335a4e\SECURITY_AUDIT_REPORT.md`
- `C:\Users\Despot\Desktop\wedding\.claude\worktrees\jovial-colden-335a4e\POST_V3_CLEANUP_AUDIT.md`
- `C:\Users\Despot\Desktop\wedding\.claude\worktrees\jovial-colden-335a4e\MERGE_PREP_SUMMARY.md`

### Architecture and runtime contracts

- `docs/v3/README.md`
- `docs/v3/V3_BUILD_INDEX.md`
- `docs/v3/ARCHITECTURE.md`
- `docs/v3/V3_OVERVIEW.md`
- `docs/v3/execute_v3.md`
- `docs/v3/V3_FULL_CUTOVER_PLAN.md`
- `docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`
- `package.json`

## Authority order

When these documents disagree, use this order:

1. live code and migrations
2. `docs/v3/ARCHITECTURE.md`
3. `docs/v3/execute_v3.md`
4. the latest execution sections of `SMALL_UNPREDICTABLE_BUGS_CATALOG.md`
5. review-worktree tactical docs
6. older slice or roadmap prose

For the catalogue specifically, treat these sections as the active execution spine:

- section `15` for track split and overall ordering
- section `16.9` for the revised Phase 0 floor

Do not use the early “22 small unpredictable issues” framing as the execution boundary.

## Non-negotiable execution rules

These rules are inherited from the architecture and execution docs and are mandatory for every slice.

1. One worker prompt = one slice = one PR.
2. Preserve strangler compatibility until a later cutover phase explicitly authorizes retirement.
3. Do not unregister legacy workers just because a better path exists on paper.
4. Migrations are additive unless a dedicated migration sequence says otherwise.
5. Regenerate `src/types/database.types.ts` after schema changes.
6. Tenant isolation is a launch requirement, not a cleanup item.
7. The verifier boundary is mandatory for risky actions.
8. Audience and recipient facts are backend-resolved, never guessed by the writer.
9. Sleeper workers must re-check pause and state after wake.
10. If a slice spans multiple phases or unrelated tracks, it is too big.

## What changed in this planning pass

This master plan incorporates two critical corrections:

1. The catalogue is much larger and denser than a heading-only count suggests.
2. The review-worktree contains live tactical issues not yet represented as catalogue IDs and they must be tracked explicitly.

## Current execution baseline

The safest execution framing is:

- Phase 0 = product-correctness floor
- Phase 0-adjacent = verification and enabling substrate that can run in parallel
- Carry-forward review slices = tactical live-path hardening from the review worktree
- Post-floor work = catalogue Tracks A through I, plus Phase 2 adjacent systems

## Phase 0 — Product-correctness floor

These are the must-land-before-meaningful-production-use bundles from `SMALL_UNPREDICTABLE_BUGS_CATALOG.md` section `16.9`.

### P0.1 — Cross-tenant bleed bundle

IDs:

- `SU-116`
- `SU-116a`
- `SU-116e`

Intent:

- eliminate cross-tenant bleed across retrieval, OAuth token surface, and storage bucket exposure

Why this is isolated:

- security-critical
- bounded by tenant-proof and storage/auth surfaces
- should not be mixed with unrelated prompt or UX changes

### P0.2 — Memory self-poisoning bundle

IDs:

- `SU-171`
- `SU-171a`
- `SU-171b`

Intent:

- enforce the architectural rule that outbound / persona text must not silently become trusted memory
- close the active live leak in `captureDraftLearningInput`
- distinguish operator-typed memory from assistant-proposed confirmations

Why this is isolated:

- touches memory semantics and write provenance
- should not be bundled with general retrieval improvements

### P0.3 — PII lifecycle bundle

IDs:

- `SU-34`
- `SU-45`
- `SU-283`

Intent:

- remove PII from inbound body persistence, outbound draft surfaces, and attachment flows

Why this is isolated:

- it spans ingress, drafting, and attachments
- this is a single privacy lifecycle problem, not three unrelated bugs

### P0.4 — Negation preservation bundle

IDs:

- `SU-181`
- `SU-181a`
- `SU-181d`

Intent:

- ensure memory extraction and summary truncation do not invert meaning

Why this is isolated:

- shared failure mode
- naturally testable as one semantic-preservation slice family

### P0.5 — Secret-echo via persona

ID:

- `SU-193`

Intent:

- prevent prompt-injected inbound or operator-pasted secrets from being echoed by persona output

Why this is isolated:

- narrow but high-blast-radius outbound safety issue

### P0.6 — EXIF GPS stripping

ID:

- `SU-200`

Intent:

- strip location and camera metadata from public-gallery exports

Why this is isolated:

- export-pipeline focused
- easy to test separately

## Phase 0-adjacent

These should ship in parallel with the floor, not after it.

### P0A.1 — Golden-thread regression suite

ID:

- `SU-188`

Intent:

- make the floor and later slices verifiable

Planning note:

- this is the best first worker if we want durability first
- it has the lowest merge risk against product code

### P0A.2 — Accessibility framework

ID:

- `M10`

Intent:

- establish the framework for accessibility children introduced later in the catalogue

Planning note:

- this is enabling infrastructure, not the entire accessibility backlog

## Carry-forward review-worktree slices

These are real tactical slices from the review-worktree docs that must be carried alongside the catalogue plan even where no catalogue ID exists yet.

They are not the product-correctness floor unless a catalogue item already says so, but they are live runtime risks and should not be forgotten.

### R1 — Finish and verify review S1-S3 branch intent

Sources:

- `CODE_REVIEW_REPAIR_PLAN.md`
- `MERGE_PREP_SUMMARY.md`

Meaning:

- treat the review repair plan’s early slices as branch intent, not automatically shipped fact
- explicitly verify which parts of S1-S3 are present on the real target branch before declaring them done

Why this exists:

- merge-prep shows intent and partial proof, but also says lint is still red and the slice-3 E2E gate was not verified

### R2 — Draft reject/rewrite idempotency

Finding:

- `H3`

Sources:

- `CODE_REVIEW_FINDINGS.md`
- `SECURITY_AUDIT_REPORT.md`

Meaning:

- explicitly add `H3` to the implementation queue even though the review repair plan failed to assign it to a slice

Why this exists:

- replayed rejects can still emit duplicate rewrite events

### R3 — Legacy runtime tenant-scope hardening

Sources:

- `POST_V3_CLEANUP_AUDIT.md`

Meaning:

- harden live legacy worker queries that still use service role without explicit tenant proof

Current documented hotspots:

- `internalConcierge.ts`
- `commercial.ts`
- `logistics.ts`
- `concierge.ts`
- `persona.ts`

Why this exists:

- these are documented live-path gaps and are not yet represented as explicit catalogue IDs

### R4 — Legacy runtime verifier / tool-bypass hardening

Sources:

- `POST_V3_CLEANUP_AUDIT.md`

Meaning:

- close direct write and direct send paths that bypass the verifier/tool model

Current documented hotspots:

- `src/hooks/useSendMessage.ts`
- `commercial.ts`
- `logistics.ts`
- `persona.ts`

Why this exists:

- these are architecture violations on live paths, not theoretical polish

### R5 — Sleeper wake re-check hardening

Sources:

- `POST_V3_CLEANUP_AUDIT.md`

Meaning:

- patch sleeper workers that wake and draft without re-checking pause/state

Current documented hotspots:

- `calendarReminders.ts`
- `postWeddingFlow.ts`

Why this exists:

- the architecture explicitly requires pause/state re-check after wake

## Recommended first-wave slice pack

This is the safest worker-first wave.

These slices may be run in parallel as long as file ownership is kept disjoint.

1. `SU-188`
2. `SU-116 + SU-116a + SU-116e`
3. `SU-171 + SU-171a + SU-171b`
4. `SU-34 + SU-45 + SU-283 + SU-193`
5. `SU-181 + SU-181a + SU-181d`
6. `SU-200`

Reasoning:

- this follows the explicit revised Phase 0 bundles
- it minimizes overlap by grouping by shared write boundary
- it keeps the first wave focused on correctness and data safety

## Post-floor execution order

After the floor is stable and the carry-forward review slices are either merged or explicitly deferred, use this order.

### Track A — Meta-patch track

Execute in this order:

1. `M1`
2. `M2 + SU-170`
3. `M4`
4. `SU-108`
5. `M3`
6. `M5`
7. `M6`
8. `M7`
9. `M8`
10. `M9`

Notes:

- `M5 -> M2`
- `M6 -> M7`
- `M7 -> SU-27 / SU-55`
- `M8 -> M2`

### Track B — Structural-small track

Use for one-off schema additions that do not require pipeline redesign.

Rule:

- one structural addition per PR unless two changes share the same table and migration cleanly

### Track C — Phase 2 adjacent systems

Run on its own cadence per `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md`.

Rule:

- do not let adjacent-system work block the correctness floor

### Track D — Failure-mode / lifecycle / observability

Suggested order:

1. `SU-108`
2. `SU-100`
3. `SU-102`
4. `SU-106 / SU-110`
5. `SU-105`
6. `SU-111`
7. `SU-103`
8. `SU-101`

### Track E — Adversarial / governance / learning

Suggested order:

1. `SU-116` with highest priority
2. `SU-120`
3. `SU-115`
4. `SU-117`
5. `SU-118`
6. `SU-119`
7. `SU-124`
8. `SU-122`
9. `SU-123`
10. `SU-121`
11. `SU-125`

### Track F — Time, data-quality, social-graph, business-model

Suggested order:

1. pass-7 high-blast-radius items first
2. then pass-8 data quality
3. then pass-9 social graph
4. then pass-10 business-model

Suggested first items:

- `SU-126`
- `SU-127`
- `SU-132`
- `SU-135`
- `SU-137`
- `SU-145`
- `SU-146`
- `SU-152`

### Track G — Integration boundaries and content parsing

Suggested order:

1. parsing/hygiene first
2. webhook integrations after that

Suggested first items:

- `SU-166`
- `SU-167`
- `SU-168`
- then `SU-162 / SU-163 / SU-164`

### Track H — Correctness verification

Suggested order:

1. `SU-188`
2. `SU-171`
3. `SU-181`
4. `SU-172`
5. `SU-173`
6. `SU-177`
7. `SU-175`
8. `SU-187`
9. `SU-178`

### Track I — Adversarial / compliance / cultural

Suggested order by blast radius:

1. remaining Phase-0-related legal/security items first
2. then outbound legal-formation items folded into `M5`
3. naming/family-structure items folded into identity work
4. ritual/venue-cultural items folded into venue/library work

## Parallelization policy

The catalogue explicitly supports parallel execution.

Safe rule:

- five to seven workers may run in parallel if their write sets are disjoint and the critical floor order is preserved

Do not run in parallel:

- two slices editing the same worker or same narrow subsystem
- a migration-heavy slice and another slice editing the generated types off the same migration chain
- a cutover slice and a legacy-retirement slice touching the same routes or workers

## Worker prompt discipline

Every worker prompt generated from this plan must include:

1. exact source IDs
2. exact source file paths
3. exact invariants copied from architecture and execution docs
4. explicit non-goals
5. required verification command(s)
6. stop-and-report instruction if the code does not match the catalogue claim

## Zero-drift operating protocol

This is the mandatory workflow for every slice.

Do not skip steps because the catalogue or a prior prompt "already said so."

### Slice readiness gate

A slice is `ready` only if all of the following are true:

- the source IDs are explicitly named
- the live target files have been re-read in the current branch state
- adjacent sibling files have been read to copy the local idiom
- relevant tests have been found and read
- any cited schema or table has been re-checked against current migrations and `src/types/database.types.ts`
- overlap search confirms the fix is not already partially present

If any of those checks fails, the slice is not ready for a worker prompt yet.

### Required per-slice verification loop

For every slice, follow this order:

1. select the next slice from this plan
2. re-read the exact catalogue entry or review finding
3. re-read the live code files named by that entry
4. grep for the failure symptom and for partial implementations
5. classify the slice as `confirmed`, `partial`, `reframed`, or `stale`
6. only then write the worker prompt
7. after implementation, verify with the smallest correct proof set
8. mark the tracker status before moving to the next slice

### Allowed verdicts

- `confirmed`: the finding is still real as written
- `partial`: part of the fix exists; prompt only the remaining scope
- `reframed`: the problem is real but the wording in the source doc is wrong; correct it in the prompt
- `stale`: not real anymore; do not send a worker after it

### Prompt generation rule

Never generate a vibecoder prompt from an unverified catalogue line alone.

The prompt must be grounded in current code, not just in backlog prose.

### Status source of truth

The execution status of slices must be tracked in:

- `C:\Users\Despot\Desktop\wedding\docs\v3\CATALOGUE_SLICE_EXECUTION_TRACKER.md`

This prevents us from re-prompting shipped work or losing partial findings between turns.

## Verification ladder

Use the smallest proof that gives confidence.

Default baseline:

- `npm run lint`
- `npm run test:context`

When the slice changes V3 worker/runtime behavior, prefer one or more of:

- `npm run v3:verify-workers`
- `npm run v3:verify-smoke-strict`
- targeted signoff or proof harness from `package.json`

When the slice changes hosted or deployment-bound behavior:

- use the hosted proof command only if the slice truly needs it

Do not make every slice pay the cost of hosted proofs.

## Explicit non-goals for the first wave

Do not do any of the following in the first wave unless the slice explicitly requires it:

- broad legacy worker retirement
- full orchestrator cutover
- broad UI redesign
- opportunistic file splitting
- speculative schema redesign beyond the cited issue bundle

## Recommended next step

Start with `SU-188`.

Reason:

- it is Phase 0-adjacent, not blocked by the more invasive security bundles
- it makes the rest of Phase 0 verifiable
- it has the lowest merge-risk profile in the first-wave pack

If the human prefers to start with direct product-risk instead of verification infrastructure, start with:

- `SU-116 + SU-116a + SU-116e`

That is the highest-blast-radius live-risk bundle in the catalogue.
