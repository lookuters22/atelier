# Vibecoder Task: SU-116a — Bind OAuth token reads to photographer_id

## What you are fixing

`SU-116a` is confirmed live. `connected_account_oauth_tokens` currently keys reads by `connected_account_id` only in multiple service-role Gmail paths. Because service-role bypasses RLS, any path that trusts a client- or event-supplied connected account id can read the wrong tenant's Gmail token.

This is the safe next slice from the `SU-116 + SU-116a + SU-116e` bundle. Do not broaden this PR into full RAG hardening or Storage policy work.

## Read first

1. `C:\Users\Despot\Desktop\wedding\supabase\migrations\20260426120000_gmail_import_connected_accounts_import_candidates.sql`
2. `C:\Users\Despot\Desktop\wedding\supabase\migrations\20260430148000_complete_google_oauth_connection_atomic.sql`
3. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\ensureGoogleAccess.ts`
4. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\gmailOperatorSend.ts`
5. `C:\Users\Despot\Desktop\wedding\supabase\functions\auth-google-callback\index.ts`
6. `C:\Users\Despot\Desktop\wedding\supabase\functions\gmail-modify-message\index.ts`
7. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\processGmailDeltaSync.ts`
8. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\processGmailLabelsRefresh.ts`
9. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\renewGmailWatch.ts`
10. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\syncGmailLabelImportCandidates.ts`
11. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\buildGmailMaterializationArtifact.ts`
12. `C:\Users\Despot\Desktop\wedding\src\types\database.types.ts`

## Architecture invariants

- Every tenant-scoped Gmail token read must be bound to both `connected_account_id` and `photographer_id`.
- Do not rely on RLS for this table; service-role bypasses it.
- Centralize token lookup logic instead of duplicating more `.from("connected_account_oauth_tokens")` reads.
- No storage-bucket policy changes in this PR.
- No RAG / memory / retrieval changes in this PR.

## Files you will modify

1. `C:\Users\Despot\Desktop\wedding\supabase\migrations\20260731120000_connected_account_oauth_tokens_photographer_guard.sql`
2. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\loadConnectedGoogleTokens.ts`
3. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\loadConnectedGoogleTokens.test.ts`
4. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\ensureGoogleAccess.ts`
5. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\gmailOperatorSend.ts`
6. `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\gmail\buildGmailMaterializationArtifact.ts`
7. `C:\Users\Despot\Desktop\wedding\supabase\functions\auth-google-callback\index.ts`
8. `C:\Users\Despot\Desktop\wedding\supabase\functions\gmail-modify-message\index.ts`
9. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\processGmailDeltaSync.ts`
10. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\processGmailLabelsRefresh.ts`
11. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\renewGmailWatch.ts`
12. `C:\Users\Despot\Desktop\wedding\supabase\functions\inngest\functions\syncGmailLabelImportCandidates.ts`
13. `C:\Users\Despot\Desktop\wedding\src\types\database.types.ts`

## Files you will NOT modify

- anything under `C:\Users\Despot\Desktop\wedding\.github\`
- any Storage bucket policy migration
- any memory / RAG / `match_knowledge` code

## Exact changes

### Change 1: migration

Create `20260731120000_connected_account_oauth_tokens_photographer_guard.sql` that:

- adds nullable `photographer_id` to `connected_account_oauth_tokens`
- backfills it from `connected_accounts.photographer_id`
- makes it `NOT NULL`
- adds a foreign key to `photographers(id)`
- adds a composite unique/index suitable for `.eq("connected_account_id").eq("photographer_id")`
- updates `complete_google_oauth_connection(...)` so token upserts also write `photographer_id`

Do this additively. Do not rename or drop columns.

### Change 2: central helper

Create `loadConnectedGoogleTokens.ts` that loads:

- the Google connected account row scoped by `id + photographer_id`
- the token row scoped by `connected_account_id + photographer_id`

Return a narrow typed result used by Gmail send/modify/sync paths.

This helper should be the only new place that reads `connected_account_oauth_tokens` directly.

### Change 3: replace unsafe token reads

Update these files to use the helper or equivalent scoped reads:

- `auth-google-callback/index.ts`
- `gmail-modify-message/index.ts`
- `_shared/gmail/gmailOperatorSend.ts`
- `_shared/gmail/buildGmailMaterializationArtifact.ts`
- `inngest/functions/processGmailDeltaSync.ts`
- `inngest/functions/processGmailLabelsRefresh.ts`
- `inngest/functions/renewGmailWatch.ts`
- `inngest/functions/syncGmailLabelImportCandidates.ts`

Also fix any account read in those paths that currently checks only `id` without `photographer_id`.

### Change 4: ensure refresh upserts stay tenant-bound

Update `_shared/gmail/ensureGoogleAccess.ts` so the token upsert writes `photographer_id` too.

### Change 5: tests

Add `loadConnectedGoogleTokens.test.ts` covering at least:

- success only when both `connected_account_id` and `photographer_id` match
- wrong-tenant token row is rejected / not returned
- missing token row returns an explicit failure shape

Keep the test style simple and local, like existing Gmail helper tests.

## Tests

Run exactly:

```bash
cmd /c npx vitest run --config vitest.signoff.config.ts supabase/functions/_shared/gmail/loadConnectedGoogleTokens.test.ts supabase/functions/_shared/gmail/googleOAuthToken.test.ts supabase/functions/_shared/gmail/gmailOperatorSend.test.ts
```

If schema changed locally, also regenerate:

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

## Acceptance criteria

- [ ] All token reads are tenant-bound by `connected_account_id + photographer_id`
- [ ] New migration is additive and backfills cleanly
- [ ] `complete_google_oauth_connection(...)` persists `photographer_id` into token rows
- [ ] New helper test passes
- [ ] Existing targeted Gmail tests still pass
- [ ] `src/types/database.types.ts` regenerated
- [ ] No `any` added
- [ ] Commit: `fix(SU-116a): bind oauth tokens to photographer`

## If you get stuck

STOP and report back with:

- the file + symbol that blocked you
- which assumption in this prompt does not match the repo
- what you tried

Do not improvise.

## Scope discipline

Fix only `SU-116a` in this PR.

Do not pull in:

- `SU-116` full retrieval audit
- `SU-116e` storage bucket work
- broader Gmail refactors unrelated to tenant binding
