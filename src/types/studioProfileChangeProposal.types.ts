import type { PhotographerSettings } from "./photographerSettings.types.ts";

/**
 * Wire shape for a studio-profile change proposal (v1 schema), stored in
 * `public.studio_profile_change_proposals.proposal_payload` when queued for review.
 *
 * **Write authority** (no second source of truth):
 * - `settings_patch` must merge with existing JSON via the same path as other app writers
 *   (e.g. `writePhotographerSettingsMerged`). **Only** `STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS` — the
 *   studio identity/capability slice that matches the review surface, not full `PHOTOGRAPHER_SETTINGS_KEYS`.
 * - `studio_business_profile_patch` must match keys consumed by
 *   `finalize_onboarding_briefing_v1`’s `p_studio_business_profile` until a dedicated
 *   profile-only RPC exists; geography / extensions must satisfy DB check constraints
 *   (`studioGeographyContract`, validators in migrations) at apply time — this type does not
 *   deep-validate JSON blobs.
 */
export const STUDIO_PROFILE_CHANGE_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type StudioProfileChangeProposalSource = "operator_assistant" | "operator" | "system";

/**
 * Subset of `photographers.settings` that may appear in v1 proposals — same domain as
 * `AssistantStudioProfileIdentity` + inquiry style (studio capability / identity, not WhatsApp, playbook, or onboarding bookkeeping).
 */
export const STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS = [
  "studio_name",
  "manager_name",
  "photographer_names",
  "timezone",
  "currency",
  "base_location",
  "inquiry_first_step_style",
] as const;

export type StudioProfileProposalSettingsKey = (typeof STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS)[number];

export type StudioProfileSettingsPatchV1 = Partial<Pick<PhotographerSettings, StudioProfileProposalSettingsKey>>;

/**
 * v1: bounded keys allowed in `p_studio_business_profile` for `finalize_onboarding_briefing_v1`
 * (see `20260506000000_finalize_onboarding_briefing_v1_geography_guard.sql`).
 * `core_services` exists on the table but is not in that RPC’s upsert; omit from v1 proposal surface
 * until a single apply path is defined.
 */
export const STUDIO_BIZ_PROFILE_PROPOSAL_KEYS = [
  "service_types",
  "service_availability",
  "geographic_scope",
  "travel_policy",
  "booking_scope",
  "client_types",
  "deliverable_types",
  "lead_acceptance_rules",
  "language_support",
  "team_structure",
  "extensions",
  "source_type",
] as const;

export type StudioBusinessProfileProposalKey = (typeof STUDIO_BIZ_PROFILE_PROPOSAL_KEYS)[number];

export type StudioBusinessProfilePatchV1 = {
  [K in StudioBusinessProfileProposalKey]?: unknown;
};

export type StudioProfileChangeProposalV1 = {
  schema_version: typeof STUDIO_PROFILE_CHANGE_PROPOSAL_SCHEMA_VERSION;
  source: StudioProfileChangeProposalSource;
  /** ISO 8601 */
  proposed_at: string;
  /** Operator-visible context (not shown to end clients) */
  rationale: string;
  /** Subset of settings aligned with studio profile review / Ana identity (not all `PHOTOGRAPHER_SETTINGS_KEYS`) */
  settings_patch?: StudioProfileSettingsPatchV1;
  /** Top-level JSONB column fragments for `studio_business_profiles` (finalize RPC shape) */
  studio_business_profile_patch?: StudioBusinessProfilePatchV1;
};
