/**
 * Read-only `studio_business_profiles` + key `photographers.settings` for Ana grounding and
 * operator review surfaces. Shared with `supabase/functions/_shared/context` re-exports.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.ts";
import type {
  AssistantStudioProfile,
  AssistantStudioProfileCapability,
  AssistantStudioProfileIdentity,
} from "../types/assistantContext.types.ts";
import { readPhotographerSettings, type ReadPhotographerSettingsResult } from "./photographerSettings.ts";
import type { StudioBaseLocation } from "./studioBaseLocation.ts";
import { readStudioEffectiveGeographyFromRows, type EffectiveGeography } from "./studioEffectiveGeography.ts";
import type { StudioProfileProposalDiffBase } from "./studioProfileChangeProposalDiff.ts";
import { STUDIO_BIZ_PROFILE_PROPOSAL_KEYS } from "../types/studioProfileChangeProposal.types.ts";
import { summarizeProfileJsonField as summarizeProfileJsonFieldImpl } from "./profileFieldDisplay.ts";

const MAX_SUMMARY_CHARS = 520;
const MAX_EXTENSIONS_CHARS = 360;

/** @see {@link summarizeProfileJsonFieldImpl} — re-exported for edge bundle and tests. */
export function summarizeProfileJsonField(value: unknown, maxChars: number): string | null {
  return summarizeProfileJsonFieldImpl(value, maxChars);
}

function formatBaseLocationLine(loc: StudioBaseLocation | null | undefined): string | null {
  if (loc == null) return null;
  const label = typeof loc.label === "string" ? loc.label.trim() : "";
  if (!label) return null;
  const cc = typeof loc.country_code === "string" && loc.country_code.trim() ? loc.country_code.trim() : null;
  return cc ? `${label} (${cc})` : label;
}

export function mapSettingsToAssistantStudioIdentity(
  settings: ReadPhotographerSettingsResult | null,
): AssistantStudioProfileIdentity {
  const c = settings?.contract ?? {};
  return {
    studio_name: c.studio_name?.trim() || null,
    manager_name: c.manager_name?.trim() || null,
    photographer_names: c.photographer_names?.trim() || null,
    timezone: c.timezone?.trim() || null,
    currency: c.currency?.trim() || null,
    base_location: formatBaseLocationLine(c.base_location ?? undefined),
    inquiry_first_step_style:
      c.inquiry_first_step_style != null && String(c.inquiry_first_step_style).trim() !== ""
        ? String(c.inquiry_first_step_style).trim()
        : null,
  };
}

function pickBusinessProfileJsonForDiff(
  row: Database["public"]["Tables"]["studio_business_profiles"]["Row"],
): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of STUDIO_BIZ_PROFILE_PROPOSAL_KEYS) {
    if (k in (row as Record<string, unknown>)) {
      o[k] = (row as Record<string, unknown>)[k] as unknown;
    }
  }
  return o;
}

function mapRowToCapability(row: Database["public"]["Tables"]["studio_business_profiles"]["Row"]): AssistantStudioProfileCapability {
  const extRaw = summarizeProfileJsonField(row.extensions, MAX_EXTENSIONS_CHARS);
  return {
    service_types: summarizeProfileJsonField(row.service_types, MAX_SUMMARY_CHARS),
    core_services: summarizeProfileJsonField(row.core_services, MAX_SUMMARY_CHARS),
    deliverable_types: summarizeProfileJsonField(row.deliverable_types, MAX_SUMMARY_CHARS),
    geographic_scope: summarizeProfileJsonField(row.geographic_scope, MAX_SUMMARY_CHARS),
    travel_policy: summarizeProfileJsonField(row.travel_policy, MAX_SUMMARY_CHARS),
    language_support: summarizeProfileJsonField(row.language_support, MAX_SUMMARY_CHARS),
    team_structure: summarizeProfileJsonField(row.team_structure, MAX_SUMMARY_CHARS),
    client_types: summarizeProfileJsonField(row.client_types, MAX_SUMMARY_CHARS),
    lead_acceptance_rules: summarizeProfileJsonField(row.lead_acceptance_rules, MAX_SUMMARY_CHARS),
    service_availability: summarizeProfileJsonField(row.service_availability, MAX_SUMMARY_CHARS),
    booking_scope: summarizeProfileJsonField(row.booking_scope, MAX_SUMMARY_CHARS),
    extensions_summary: extRaw,
    source_type: typeof row.source_type === "string" && row.source_type.trim() ? row.source_type.trim() : null,
    updated_at: typeof row.updated_at === "string" && row.updated_at.trim() ? row.updated_at.trim() : null,
  };
}

const PROFILE_SELECT = [
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
  "core_services",
  "source_type",
  "updated_at",
].join(", ");

export type StudioProfileReviewData = {
  profile: AssistantStudioProfile;
  /** Derived coverage posture from `readStudioEffectiveGeographyFromRows` (contract helpers). */
  effectiveGeography: EffectiveGeography;
  /**
   * Live `photographers.settings` contract + `studio_business_profiles` JSON columns (proposal keys only)
   * for current-vs-proposed diffs. Same read path as the identity + capability surface above.
   */
  proposalDiffBase: StudioProfileProposalDiffBase;
};

/**
 * Load studio business profile + settings identity, plus effective geography (same row inputs
 * as Ana's read path). Use for operator **review** surfaces; read-only.
 */
export async function fetchStudioProfileReviewData(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<StudioProfileReviewData> {
  const [profileRes, settingsResult] = await Promise.all([
    supabase
      .from("studio_business_profiles")
      .select(PROFILE_SELECT)
      .eq("photographer_id", photographerId)
      .maybeSingle(),
    readPhotographerSettings(supabase, photographerId),
  ]);

  if (profileRes.error) {
    throw new Error(`fetchStudioProfileReviewData: ${profileRes.error.message}`);
  }

  const identity = mapSettingsToAssistantStudioIdentity(settingsResult);

  const row = profileRes.data;
  const effectiveGeography = readStudioEffectiveGeographyFromRows({
    photographerSettings: settingsResult?.raw ?? null,
    studioBusinessProfile: row,
  });

  const proposalDiffBase: StudioProfileProposalDiffBase = {
    settings: settingsResult?.contract ?? {},
    businessProfileJson: row ? pickBusinessProfileJsonForDiff(row as Database["public"]["Tables"]["studio_business_profiles"]["Row"]) : null,
  };

  if (!row) {
    return {
      profile: {
        hasBusinessProfileRow: false,
        identity,
        capability: null,
      },
      effectiveGeography,
      proposalDiffBase,
    };
  }

  return {
    profile: {
      hasBusinessProfileRow: true,
      identity,
      capability: mapRowToCapability(row as Database["public"]["Tables"]["studio_business_profiles"]["Row"]),
    },
    effectiveGeography,
    proposalDiffBase,
  };
}

/**
 * Read-only business profile for operator Ana (same as {@link fetchStudioProfileReviewData} without extra geography return).
 */
export async function fetchAssistantStudioBusinessProfile(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<AssistantStudioProfile> {
  const { profile } = await fetchStudioProfileReviewData(supabase, photographerId);
  return profile;
}
