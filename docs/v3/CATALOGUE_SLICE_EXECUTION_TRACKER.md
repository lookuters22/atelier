# Catalogue Slice Execution Tracker

## Purpose

This is the anti-drift control file for catalogue execution.

Use it alongside:

- `C:\Users\Despot\Desktop\wedding\docs\v3\CATALOGUE_IMPLEMENTATION_SLICES_MASTER.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\SMALL_UNPREDICTABLE_BUGS_CATALOG.md`
- `C:\Users\Despot\Desktop\wedding\.claude\worktrees\jovial-colden-335a4e\CODE_REVIEW_FINDINGS.md`

The master slice plan decides order and grouping.

This tracker records execution state so each future worker prompt is grounded in current reality.

## Status vocabulary

Use only these statuses:

- `untriaged`
- `ready`
- `in_prompting`
- `in_flight`
- `shipped`
- `partial`
- `reframed`
- `stale`
- `blocked`
- `deferred`

## Update rules

Before writing a worker prompt:

1. find the slice here
2. verify the live code again
3. update `verification_state`
4. record any scope correction in `notes`

After a worker finishes:

1. record the commit or PR reference if available
2. update status
3. note any follow-up IDs or residual risk

## Current execution baseline

### Phase 0 floor and adjacent slices

| slice_key | source_ids | lane | status | verification_state | notes |
| --- | --- | --- | --- | --- | --- |
| P0A.1 | `SU-188` | phase0-adjacent | shipped | partial resolved for slice 1 — canonical registry and offline baseline gate added on local `main` at `689cd99` | Existing proof harnesses remain in place; follow-up SU-188 work is future fixture expansion / CI wiring, not this slice. |
| P0.1 | `SU-116 + SU-116a + SU-116e` | phase0 | ready | reframed — `SU-116a` confirmed live; `SU-116` is partial/hardening; `SU-116e` appears mostly already enforced for current buckets and should not be prompted as-written | Safe execution order: land `SU-116a` first, then handle `SU-116` defense-in-depth / regression coverage as a follow-up slice; treat `SU-116e` as stale unless a remaining unguarded bucket is found. |
| P0.2 | `SU-171 + SU-171a + SU-171b` | phase0 | ready | reframed — `SU-171a` confirmed live active leak; `SU-171b` confirmed live provenance gap; root `SU-171` architecture/schema work should not be prompted as one broad PR | Safe execution order: land `SU-171a` first, then `SU-171b`, then any remaining `SU-171` source-type / retrieval hardening once the live leaks are closed. |
| P0.3 | `SU-34 + SU-45 + SU-283` | phase0 | ready | bundled from catalogue section 16.9 | PII lifecycle bundle. |
| P0.4 | `SU-181 + SU-181a + SU-181d` | phase0 | ready | bundled from catalogue section 16.9 | Negation preservation bundle. |
| P0.5 | `SU-193` | phase0 | ready | verified at planning level | Secret-echo via persona. |
| P0.6 | `SU-200` | phase0 | ready | verified at planning level | EXIF GPS stripping. |
| P0A.2 | `M10` | phase0-adjacent | partial | needs reframing before prompting | Accessibility framework is enabling infrastructure, not whole accessibility backlog. |

### Carry-forward review-worktree slices

| slice_key | source_ids | lane | status | verification_state | notes |
| --- | --- | --- | --- | --- | --- |
| R1 | review S1-S3 verification | review-carry | partial | review artifacts read; branch reality must be re-checked | `MERGE_PREP_SUMMARY.md` says proof is incomplete. |
| R2 | `H3` | review-carry | shipped | helper now returns explicit `transitioned` state; reject path returns `409` without emitting rewrite event when no row matched; targeted proof lane passes | Landed locally at `9441907` (`fix(H3): gate draft rewrite emit on real transition`). |
| R3 | legacy tenant-scope hardening | review-carry | partial | hotspots identified from cleanup audit | Needs exact file-by-file live re-check before prompting. |
| R4 | legacy verifier/tool-bypass hardening | review-carry | partial | hotspots identified from cleanup audit | Needs exact path-level prompt scoping. |
| R5 | sleeper wake re-check hardening | review-carry | partial | hotspots identified from cleanup audit | Must be narrowed to each sleeper path before worker handoff. |
| R6 | `C3` | review-carry | shipped | shared auth helper now reuses one anon client, calls `auth.getUser(jwt)`, and targeted test lane passes (5 tests) | Landed on integration branch at `80fbfc5` (`fix(C3): reuse auth supabase client`). |

## Next-up queue

1. `P0A.1` / `SU-188`
2. `P0.1` / `SU-116 + SU-116a + SU-116e`
3. `P0.2` / `SU-171 + SU-171a + SU-171b`
4. `P0.3 + P0.5` / `SU-34 + SU-45 + SU-283 + SU-193`
5. `P0.4` / `SU-181 + SU-181a + SU-181d`
6. `P0.6` / `SU-200`

## Active split slices

| slice_key | source_ids | lane | status | verification_state | notes |
| --- | --- | --- | --- | --- | --- |
| P0.1a | `SU-116a` | phase0 | shipped | signoff Gmail trio passes; `database.types.ts` limited to `connected_account_oauth_tokens.photographer_id` Row/Insert/Update + `connected_account_oauth_tokens_photographer_id_fkey` | Follow-up `fix(SU-116a): remove unrelated generated type drift` resets `database.types.ts` to pre-`4de59f8` baseline plus token-table-only delta; Gmail runtime + migration unchanged. |
| P0.1b | `SU-116` | phase0 | partial | retrieval paths already scope by `photographer_id`; remaining work is defense-in-depth and stronger regression coverage, not a greenfield tenant-isolation fix | Investigate after `SU-116a` lands; likely a smaller follow-up slice or possible defer behind more critical live issues. |
| P0.2a | `SU-171a` | phase0 | shipped | bounded draft-learning signal stored instead of full persona draft body; reply-mode `fetchMemoryHeaders` excludes draft learning types; targeted proof lane passes (70 tests) | Landed locally at `87e15b7` (`fix(SU-171a): exclude draft learning from reply memory`). Assistant-mode memory reads remain unchanged by design; `SU-171b` is next. |
| P0.2b | `SU-171b` | phase0 | shipped | provenance added at the confirm boundary: widget sends `proposalOrigin`, validator requires it, and write audit records it; targeted proof lane passes (64 tests) | Landed locally at `955b2b8` (`fix(SU-171b): add assistant memory provenance`). Current live UI only uses `assistant_proposed_confirmed`; broader operator-typed vs edited provenance remains future UX/schema work. |

## Operator note

This tracker is not a full decomposition of all 1000+ items.

It is the live execution ledger for the slices we actively pull from the master plan.

Expand it slice by slice as we progress, rather than pretending every downstream item is already individually verified.
