# Merge-prep summary (final pass)

## PR scope (this commit / branch intent)

- **In scope:** V3 production-readiness slices 1–3 (as implemented on this branch), full `supabase/migrations/` chain extending `ana/main`, and permanent **merge-gate** tooling (Playwright slice3 + slice2 proof scripts/SQL).
- **Out of scope for this merge-prep commit:** Large untracked areas (e.g. many under `supabase/functions/`, extra planning docs) remain for separate PRs unless already part of your tracked feature work.

## Migration coherence (top gate)

Compared to `ana/main`, the migration folder is a **single ordered chain**: three timestamp bumps are recorded as renames (`R` in `git diff --cached`), plus additive migrations through `20260430152000_slice2_pgvector_ann_and_hot_indexes.sql`. No duplicate migration timestamps in `supabase/migrations/`.

## Verification tooling kept

| Path | Role |
|------|------|
| `playwright.config.ts` | Playwright config |
| `playwright/slice3-merge-gate.spec.ts` | Browser merge gate |
| `scripts/playwright_ensure_test_user.ts` | Auth user for E2E |
| `scripts/playwright_seed_merge_gate_fixture.ts` | DB fixture (requires `MERGE_GATE_ALLOW_SEED=1`) |
| `scripts/merge_gate_slice2_live_proof.ts` | Slice 2 live proof |
| `scripts/merge_gate_slice2_explain.sql` | Manual EXPLAIN |
| `scripts/verify_slice2_query_plans.sql` | Index verification |

## Hygiene

- `reports/` gitignored (local QA dumps).
- `supabase/.temp/` gitignored; paths removed from git index (local CLI cache only).

## Seed safety

`playwright_seed_merge_gate_fixture.ts` exits unless `MERGE_GATE_ALLOW_SEED=1`. `npm run playwright:seed-merge-gate-fixture` sets it via `cross-env`.

## Checks (this pass)

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| `npm run test:context` | Pass |
| `npm run lint` | Fail (many pre-existing issues across `supabase/functions`, not introduced by merge-prep files) |
| `npm run test:e2e:slice3` | Not verified here (login timed out waiting for Password field — confirm against staging/local auth UI + run seed with `MERGE_GATE_ALLOW_SEED=1`) |
| Seed without `MERGE_GATE_ALLOW_SEED` | Exit code 2 (refuses, as intended) |
