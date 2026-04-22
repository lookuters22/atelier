# Studio profile change proposal — foundation (v1)

Durable **queue** table: `public.studio_profile_change_proposals` (migrations `20260622120000_studio_profile_change_proposals_v1.sql` + `20260622120001_studio_profile_change_proposals_rls_select_insert_only.sql`). Proposals are listed on **Studio profile (review)**; **Ana (operator widget)** only **enqueues** — bounded `studio_profile_change_proposal` in `proposedActions` — **nothing is stored until** the operator taps **Enqueue for review (confirm)**; that path calls `insertStudioProfileChangeProposal` with `StudioProfileChangeProposalV1` validated on the client (and the same contract is enforced when parsing the model output server-side). **Live apply** is **not** from Ana: it uses **`apply_studio_profile_change_proposal_v1`** (migration `20260624120000_apply_studio_profile_change_proposal_v1.sql`) from the review page after a human approves, merging bounded settings + business patches with the same key allowlists; status becomes **`applied`** only on success.

**RLS (client path):** `SELECT` and `INSERT` for `photographer_id = auth.uid()`; **no** direct `UPDATE`/`DELETE` policies — status moves and apply use **SECURITY DEFINER** RPCs: **`review_studio_profile_change_proposal`**: `pending_review` → `rejected` | `withdrawn`; **`apply_studio_profile_change_proposal_v1`**: `pending_review` → **`applied`** after successful writes to `photographers` / `studio_business_profiles` (tenant-scoped inside the function).

## Write authority (must not regress)

| Layer | Primary mechanisms today |
|--------|---------------------------|
| `photographers.settings` | Merge + persist via `writePhotographerSettingsMerged` (`src/lib/photographerSettings.ts`). **Proposals** only touch `STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS` (studio name, team, timezone, currency, `base_location`, inquiry style) — not WhatsApp, playbook version, or onboarding timestamps. |
| `studio_business_profiles` | Onboarding path: `finalize_onboarding_briefing_v1` (`p_studio_business_profile` JSON) with geography guards (`20260506000000_finalize_onboarding_briefing_v1_geography_guard.sql`). Extensions / `service_areas` / `geographic_scope` must satisfy check constraints and `studioGeographyContract`. |

**Apply (v1):** the apply RPC **merges** `settings_patch` with existing `photographers.settings` (same key subset as `mergePhotographerSettings` / `writePhotographerSettingsMerged`) and **sets** `studio_business_profiles` columns for keys present in `studio_business_profile_patch` (or inserts a new row with patch + defaults). It does **not** call `finalize_onboarding_briefing_v1` (playbook/KB), so it stays a narrow profile-only path; DB `CHECK` constraints and validators enforce geography JSON shapes. Broader rewrites of onboarding data still go through the onboarding finalize path.

## Proposal wire shape

Type: `StudioProfileChangeProposalV1` (`src/types/studioProfileChangeProposal.types.ts`), `schema_version: 1`.

- **`settings_patch`**: optional `StudioProfileSettingsPatchV1` — only keys in `STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS` (aligned with `AssistantStudioProfileIdentity` + inquiry style). **Excluded** from v1 proposals: `onboarding_completed_at`, `playbook_version`, `whatsapp_number`, `admin_mobile_number`.
- **`studio_business_profile_patch`**: optional object whose keys are **only** those accepted in `finalize_onboarding_briefing_v1`’s `p_studio_business_profile` (see `STUDIO_BIZ_PROFILE_PROPOSAL_KEYS`).  
  **Note:** The table also has `core_services`; that column is **not** in the current finalize upsert list — proposals must not use `core_services` in v1 until apply semantics are unified.

Validation helper: `validateStudioProfileChangeProposalV1` (`src/lib/studioProfileChangeProposalBounds.ts`).  
Review lines: `formatStudioProfileChangeProposalForReview`.

## UI

`StudioProfileReviewPage` — **Change proposals (queue)**: list with **Pending review** vs **Closed**; **Apply to live profile** (when the proposal has patches) calls `applyStudioProfileChangeProposal` → `apply_studio_profile_change_proposal_v1`; **Withdraw** / **Reject** call `reviewStudioProfileChangeProposal` → `review_studio_profile_change_proposal` (status only).

**Current vs proposed (read-only):** for each row with a valid `StudioProfileChangeProposalV1` that includes bounded patches, the review UI offers **Current vs proposed (read-only preview)** — a side-by-side table: **current** is derived from the same read path as the rest of the page (`readPhotographerSettings` contract for settings keys; live `studio_business_profiles` JSON columns for `STUDIO_BIZ_PROFILE_PROPOSAL_KEYS`); **proposed** is the stored patch only. Pure logic: `buildStudioProfileChangeProposalDiff` (`src/lib/studioProfileChangeProposalDiff.ts`). If the live profile failed to load, the banner explains that the current column is unavailable while proposed still reflects the stored payload.

## Related docs

- `DATABASE_SCHEMA.md` — `photographers.settings`, `studio_business_profiles`
- `V3_OPERATOR_ANA_*` execution docs — Ana read path for studio profile
