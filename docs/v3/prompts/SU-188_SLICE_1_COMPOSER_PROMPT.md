# Vibecoder Task: SU-188 — Golden-thread baseline registry and signoff gate

## What you are fixing

`SU-188` is **PARTIAL**, not greenfield. The live repo already contains deterministic stress replay harnesses and a live ingress verification harness, but there is still **no single authoritative golden-thread registry** and **no single signoff command** that proves the current canonical regression baseline. That means future fixes can land without adding or preserving a canonical regression fixture, and the suite can drift silently.

**Source:** `C:\Users\Despot\Desktop\wedding\docs\v3\SMALL_UNPREDICTABLE_BUGS_CATALOG.md` (`SU-188`), verified against live code in this repo.

## Read first (grounding — do not skip)

1. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3StressReplayBatch1Harness.ts` — existing deterministic decision-point model and evaluation helper.
2. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3StressReplayBatch2Harness.ts` — sibling idiom for adding more critical replay fixtures.
3. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3StressReplayBatch3Harness.ts` — same local pattern; current third batch.
4. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3StressReplayBatch1Harness.test.ts` — Vitest assertion style to replicate.
5. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3StressReplayBatch2Harness.test.ts` — sibling test conventions.
6. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3StressReplayBatch3Harness.test.ts` — sibling test conventions.
7. `C:\Users\Despot\Desktop\wedding\scripts\simulate_v3_worker_verification.ts` — existing live verification harness; do not rebuild it from scratch.
8. `C:\Users\Despot\Desktop\wedding\scripts\v3_verify_smoke_strict_entry.ts` — thin wrapper pattern for one-command verification entrypoints.
9. `C:\Users\Despot\Desktop\wedding\vitest.signoff.config.ts` — signoff config pattern.
10. `C:\Users\Despot\Desktop\wedding\package.json` — existing proof command naming.

## Architecture invariants (do NOT violate)

- Build on the existing proof surface. Do **not** replace `v3StressReplayBatch*` or `simulate_v3_worker_verification.ts`.
- This slice is **offline / CI-friendly baseline infrastructure**. The new signoff command must run under Vitest without requiring live Supabase, Inngest, or Edge secrets.
- Do not add schema changes, migrations, or generated type changes.
- Do not touch `.github/workflows` in this slice. CI wiring is a separate slice.
- Do not broaden this into the full SU-188 end-to-end program. This PR only establishes the canonical baseline registry and gate over the proof assets that already exist.

## Files you will modify

1. **`C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3GoldenThreadCatalog.ts`** — new canonical registry that flattens the existing stress replay decision points into one typed golden-thread inventory.
2. **`C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3GoldenThreadCatalog.test.ts`** — new Vitest file that enforces the baseline contract.
3. **`C:\Users\Despot\Desktop\wedding\package.json`** — add one signoff command for the golden-thread baseline.

## Files you will NOT modify (explicit non-goals)

- `C:\Users\Despot\Desktop\wedding\scripts\simulate_v3_worker_verification.ts` — read it for context, but do not rewrite or refactor it in this PR.
- `C:\Users\Despot\Desktop\wedding\.github\` — out of scope even if missing; CI workflow creation is not part of this slice.
- Any migration under `C:\Users\Despot\Desktop\wedding\supabase\migrations\` — no schema work here.

## Exact changes

### Change 1: `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3GoldenThreadCatalog.ts`

Add a new typed module that:

- imports `BATCH1_DECISION_POINTS`, `BATCH2_DECISION_POINTS`, and `BATCH3_DECISION_POINTS`
- defines a narrow exported type for the canonical offline golden-thread fixture shape
- exports one flattened constant such as `V3_GOLDEN_THREAD_FIXTURES`
- preserves source provenance per row, at minimum:
  - `fixtureId`
  - `batch`
  - `stressTest`
  - `title`
  - `expectedProductBehavior`
  - `primaryGapIfUnmet`
  - `sourceFile`
- exports small helper metadata for tests, for example:
  - total fixture count
  - distinct stress test ids covered
  - distinct batch ids covered

Keep this file boring and deterministic. It is a registry, not a new harness.

### Change 2: `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3GoldenThreadCatalog.test.ts`

Add a Vitest file that enforces the new baseline contract.

It must assert at least:

- all golden-thread fixture ids are unique
- total fixture count is at least `50`
- coverage includes stress tests `1` through `8`
- every row has non-empty `expectedProductBehavior`
- every row has non-empty `primaryGapIfUnmet`
- every row has non-empty `sourceFile`
- batch coverage includes all three current replay batches

Use the same direct `describe` / `it` / `expect` style as the existing `v3StressReplayBatch*.test.ts` files.

### Change 3: `C:\Users\Despot\Desktop\wedding\package.json`

Add a new script:

```json
"v3:proof-golden-threads": "vitest run --config vitest.signoff.config.ts supabase/functions/_shared/qa/v3GoldenThreadCatalog.test.ts supabase/functions/_shared/qa/v3StressReplayBatch1Harness.test.ts supabase/functions/_shared/qa/v3StressReplayBatch2Harness.test.ts supabase/functions/_shared/qa/v3StressReplayBatch3Harness.test.ts"
```

Do not remove or rename the existing proof scripts.

## Tests

1. **New / updated test:** `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\qa\v3GoldenThreadCatalog.test.ts` — asserts the canonical offline golden-thread baseline contract.
2. Run via: `npm run v3:proof-golden-threads`
3. Test framework: `vitest`
4. Mock pattern: no custom mock framework needed; follow the existing direct-import deterministic harness pattern.

## Acceptance criteria

- [ ] All listed files modified as specified
- [ ] `npm run v3:proof-golden-threads` passes
- [ ] Existing batch harness tests still pass under that command
- [ ] No live env or hosted dependency was added to the new baseline signoff command
- [ ] No `any` added
- [ ] No bare `console.log` added in production code paths
- [ ] Commit: `fix(SU-188): add golden-thread baseline gate`

## If you get stuck

STOP and report back with:

- the file + symbol that blocked you
- which assumption in this prompt does not match the code
- what you tried

Do not improvise. If you discover that a canonical registry already exists elsewhere, report that and stop.

## Scope discipline

Fix only this **SU-188 slice-1 baseline**. Do not attempt:

- the full 30–50 fixture expansion program
- live harness refactors
- GitHub Actions / CI workflow creation
- broader proof-suite cleanup

If you notice adjacent improvements, list them as follow-ups at the bottom of your completion report.
