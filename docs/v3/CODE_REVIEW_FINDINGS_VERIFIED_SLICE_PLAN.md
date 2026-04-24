# Code Review Findings Verified Slice Plan

## Purpose

This document turns the current review backlog into a verified execution plan for safe vibecoder slices.

It is intentionally narrower than the raw review file.

Use this document when:

- deciding whether a finding is still real
- deciding whether a finding is a worker-safe coding task
- choosing the next narrow slice
- writing worker prompts that should not drift or sprawl

## Source of truth

Verified against live code in this repository on 2026-04-24.

Primary review source used for this verification pass:

- `.claude/worktrees/jovial-colden-335a4e/CODE_REVIEW_FINDINGS.md`

Important note:

- `docs/v3/CODE_REVIEW_FINDINGS.md` does not currently exist in this repo
- do not cite that missing file as the canonical source until it is created

Grounding files used during verification:

- `README.md`
- `docs/v3/ARCHITECTURE.md`
- `docs/v3/V3_OVERVIEW.md`
- `package.json`
- `supabase/config.toml`
- `supabase/migrations/*`
- `src/*`
- `supabase/functions/*`

## How to use this plan

Rules for vibecoder execution:

1. One slice = one finding.
2. Do not batch unrelated findings into one PR.
3. Prefer slices that touch one or two files and have obvious verification.
4. If a finding is marked `REFRAMED` or `PARTIAL`, do not write a worker prompt from the original wording.
5. If a finding is marked `DESIGN TRACK`, do not send it to vibecoder as a tactical implementation slice.
6. Preserve current behavior unless the slice explicitly changes it.
7. Add or update tests when the local module already has a test pattern; do not invent giant test scaffolding in the same PR.

## Verification ledger

Only findings checked against live code in this pass are listed below.

### Confirmed and worker-safe

These are real and narrow enough to slice safely.

| ID | Verdict | Current live-code reality | Recommended action |
|---|---|---|---|
| C3 | CONFIRMED | `supabase/functions/_shared/authPhotographer.ts` creates a new Supabase client inside both JWT helpers on every call. | Fix first. Small hot-path hardening slice. |
| H3 | CONFIRMED | `api-resolve-draft` can emit rewrite events after a replay because the pending -> processing transition is not verified as an actual row transition before event emission. | Fix second. Small backend correctness slice. |
| C2 | CONFIRMED | No top-level React error boundary exists in `src/main.tsx` / `src/App.tsx`, and no reusable `ErrorBoundary` component exists in `src/`. | Fix third. Small frontend resilience slice. |
| C4 | CONFIRMED | `.github/workflows` is absent. | Add a minimal CI gate as its own slice. |
| M5 | CONFIRMED | `api-resolve-draft` collapses unknown exceptions into `400`; `webhook-whatsapp` returns `403` for malformed/unsupported request shapes. | Narrow API-status-correction slice. |
| M6 | CONFIRMED | `src/hooks/useWeddingProject.ts` still uses `select("*, clients(*)")`. | Narrow over-fetch reduction slice. |
| M24 | CONFIRMED | `webhook-whatsapp/index.ts` honors `TWILIO_WEBHOOK_VERIFY_SKIP` with no production guardrail. | Narrow security guardrail slice. |
| H1 | CONFIRMED | Wildcard CORS is present on authenticated edge functions. | Slice later and keep scope narrow. |
| H2 | CONFIRMED | `webhook-web/index.ts` emits `comms/web.received` on every accepted request with no replay/dedup guard. | Medium slice after smaller blockers. |
| M2 | CONFIRMED | Google OAuth flow uses signed `state` but no PKCE verifier/challenge. | Tactical auth slice, but touches both init and callback. |
| M1 | CONFIRMED | `connected_account_oauth_tokens.refresh_token` is stored plaintext. | Tactical security slice, but schema + migration required. |
| M4 | CONFIRMED | HTTP edge validation is mostly ad hoc and not consistently Zod-based. | Do not broad-sweep. Slice endpoint by endpoint only. |
| M11 | CONFIRMED | `connected_account_oauth_tokens` has RLS enabled with intentionally no policies; deny-all is implicit, not explicit. | Small DB clarity slice if prioritized. |
| M15 | CONFIRMED | Edge functions still use many raw `console.*` calls; structured logging is partial. | Only slice this if narrowed to one logging surface. |
| M16 | CONFIRMED | No log sampling layer exists. | Observability slice, not early priority. |
| M17 | CONFIRMED | `src/` has 39 `useLayoutEffect` occurrences. | Audit problem, not a single worker slice. |
| M23 | CONFIRMED | Some logs include phone/email/photographer identifiers in plain text. | Only safe as a narrow redaction slice per surface. |
| M26 | CONFIRMED | No `supabase/seed.sql` exists; local seeding is fragmented across scripts. | Dev-experience slice, not early priority. |

### Real but must be reframed before any worker prompt

These should not be handed to vibecoder using the original finding wording.

| ID | Verdict | What the raw finding gets wrong | Correct framing |
|---|---|---|---|
| C1 | REFRAMED | The finding implies all named core tables have `updated_at` columns missing triggers. Several cited core tables in the current schema do not even have `updated_at`. | Audit only tables that currently have `updated_at`, then add triggers where missing. |
| M10 | PARTIAL | The finding says the hot `messages` query shape is missing supporting composite indexes. The repo already has `(thread_id, sent_at DESC, id DESC)` for inbox latest-message lookup. | Re-run against actual hot query plans before adding another index. |
| M21 | REFRAMED | The finding says `verify_jwt = false` is global in `supabase/config.toml`. It is function-scoped with comments explaining the ES256 gateway tradeoff. | This is an auth-strategy review item, not a direct bug ticket. |
| M27 | PARTIAL | The finding says env surface is undocumented. `.env.example` and multiple runbooks do exist. | The real issue is fragmented env documentation, not total absence. |
| H4 | PARTIAL | The finding frames Inngest idempotency as systemically unenforced everywhere. The repo already contains some dedupe/idempotent patterns and at least some per-function concurrency configuration. | Audit and fix handler families one by one, not via a blanket prompt. |

### Design-track items, not first-wave worker tickets

These may be valid concerns, but they are too architectural, too broad, or too speculative for a first vibecoder slice.

| ID | Why not a first tactical slice |
|---|---|
| C5 | Performance investment, not a narrow correctness bug. |
| H5 | Unified error contract is a cross-endpoint API design change. |
| H6 | Rate limiting on `webhook-web` needs policy and storage/rate-limiter design. |
| H7 | Large-file sprawl is true but not a bounded implementation ticket on its own. |
| H8 | Correlation ID propagation is cross-stack observability design. |
| H9 | Per-tenant LLM cost logging spans multiple model call sites and data model decisions. |
| H10 | Rate-limit retry needs shared retry policy across providers. |
| M8 | JSONB-to-columns redesign requires product/schema decisions. |
| M9 | JSONB indexing needs query-driven evidence per column. |
| M12 | `SECURITY DEFINER` cataloging is an audit/governance track, not one PR. |
| M13 | Inngest dedup/concurrency/rateLimit should be handled as a handler-family audit, not one sweep. |
| M14 | Dead-letter handling needs failure-storage and alerting design. |
| M17 | 39 `useLayoutEffect` sites require triage, not a single worker pass. |
| M18 | Accessibility cleanup should be component-by-component, not broad grep-and-fix. |
| M19 | Image loading optimization is a performance track, not a safe one-PR sweep. |
| M20 | Raw payload retention is a DB/data-retention policy decision. |
| M25 | OAuth revocation path needs product and lifecycle decisions. |
| M28 | Error alerting integration is vendor and operational design work. |

## Recommended slice order

The order below is optimized for:

- low merge risk
- easy verification
- real user or operator impact
- minimal blast radius per PR

### Slice 1 - C3

Title: Shared auth-path Supabase client in `authPhotographer.ts`

Why first:

- confirmed in live code
- very small file surface
- hot path used by many authenticated edge functions
- low product-risk change if implemented carefully

Target files:

- `supabase/functions/_shared/authPhotographer.ts`
- test file only if a local test pattern exists or a new tiny helper test is easy to add

Guardrails:

- do not change auth semantics
- do not change error strings unless required
- reuse current request Authorization behavior

### Slice 2 - H3

Title: Idempotent reject/rewrite transition in `api-resolve-draft`

Why second:

- confirmed correctness bug
- duplicate rewrite events are costly and confusing
- still a contained backend slice

Target files:

- `supabase/functions/api-resolve-draft/index.ts`
- `supabase/functions/_shared/transitionDraftPendingToProcessingRewrite.ts`
- colocated tests if present

Guardrails:

- do not redesign the draft state machine
- only prevent replay-induced duplicate rewrite emission

### Slice 3 - C2

Title: Top-level React error boundary

Why third:

- confirmed user-facing resilience gap
- frontend-only and easy to reason about
- isolated from backend schema work

Target files:

- `src/main.tsx`
- `src/App.tsx`
- new boundary component under `src/components/`

Guardrails:

- no route redesign
- keep fallback UI simple and branded

### Slice 4 - C4

Title: Minimal PR CI workflow

Why here:

- once the first slices land, CI starts preserving gains
- broad leverage with small code surface

Target files:

- `.github/workflows/*`
- possibly `package.json` only if a CI-friendly script is missing

Guardrails:

- start minimal
- prefer lint + one representative test command over an expensive mega pipeline

### Slice 5 - M5

Title: Correct 4xx/5xx classification in edge handlers

Why here:

- confirmed monitoring correctness issue
- still tactical if kept to the exact handlers already verified

Target files:

- `supabase/functions/api-resolve-draft/index.ts`
- `supabase/functions/webhook-whatsapp/index.ts`

Guardrails:

- do not introduce a cross-repo error-contract rewrite
- only fix the clearly wrong status mappings

### Slice 6 - M6

Title: Narrow `useWeddingProject` client select

Why here:

- safe frontend data-contract tightening
- low-risk improvement with clear diff

Target files:

- `src/hooks/useWeddingProject.ts`
- any directly affected type/use site if required

Guardrails:

- do not change the hook return shape
- only fetch fields actually consumed by the UI

### Slice 7 - M24

Title: Production guardrail for `TWILIO_WEBHOOK_VERIFY_SKIP`

Why here:

- strong security win
- narrow file surface

Target files:

- `supabase/functions/webhook-whatsapp/index.ts`
- helper file only if needed for runtime environment checks

Guardrails:

- preserve local/dev escape hatch if explicitly intended
- forbid silent production bypass

### Slice 8 - H1

Title: CORS hardening for authenticated edge functions

Why later:

- real issue, but many entrypoints are involved
- easy to sprawl if not narrowly staged

Safe sub-slicing rule:

- one worker slice should handle a small function family or a shared helper plus 2-4 call sites max

### Slice 9 - H2

Title: `webhook-web` replay/idempotency guard

Why later:

- correct fix likely needs ingress identity/dedup key design
- still tactical, but not as tiny as slices 1-7

### Slice 10 - M2

Title: Add PKCE to Google OAuth flow

Why later:

- tactical but touches both ends of OAuth flow
- needs careful browser/redirect compatibility handling

### Slice 11 - M1

Title: Encrypt stored refresh tokens at rest

Why later:

- schema and secret-handling slice
- higher blast radius than the early slices

## Do not schedule from this plan yet

Hold these until they are converted into narrower implementation packets:

- C1
- H4
- M10
- M21
- M27

## Per-slice quality bar

Every worker slice should satisfy all of the following:

1. One finding only.
2. One clear acceptance test path.
3. No opportunistic refactors outside the finding.
4. No schema change unless the finding clearly requires one.
5. If schema changes, regenerate `src/types/database.types.ts`.
6. No new `any`.
7. No new bare `console.log` in production code paths.
8. Use existing local idioms for auth, logging, and error handling.

## Recommended next action

Start with Slice 1 (`C3`).

It is the cleanest first worker prompt because it is:

- confirmed
- small
- high-leverage
- disjoint from the broader schema and architecture debates
