/**
 * Read-only studio business profile + key settings identity for operator Ana grounding (v1).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type {
  AssistantStudioProfile,
  AssistantStudioProfileCapability,
  AssistantStudioProfileIdentity,
} from "../../../../src/types/assistantContext.types.ts";
import { readPhotographerSettings, type ReadPhotographerSettingsResult } from "../../../../src/lib/photographerSettings.ts";
import type { StudioBaseLocation } from "../../../../src/lib/studioBaseLocation.ts";

const MAX_SUMMARY_CHARS = 520;
const MAX_EXTENSIONS_CHARS = 360;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Turn JSONB column values into a short line for the LLM (bounded; no multi-KB blobs).
 */
export function summarizeProfileJsonField(value: unknown, maxChars: number): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? clip(t, maxChars) : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")) {
      return clip(value.map(String).join(", "), maxChars);
    }
    try {
      return clip(JSON.stringify(value), maxChars);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    try {
      return clip(JSON.stringify(value), maxChars);
    } catch {
      return null;
    }
  }
  return null;
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

export async function fetchAssistantStudioBusinessProfile(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<AssistantStudioProfile> {
  const [profileRes, settingsResult] = await Promise.all([
    supabase
      .from("studio_business_profiles")
      .select(
        "service_types, service_availability, geographic_scope, travel_policy, booking_scope, client_types, deliverable_types, lead_acceptance_rules, language_support, team_structure, extensions, core_services, source_type, updated_at",
      )
      .eq("photographer_id", photographerId)
      .maybeSingle(),
    readPhotographerSettings(supabase, photographerId),
  ]);

  if (profileRes.error) {
    throw new Error(`fetchAssistantStudioBusinessProfile: ${profileRes.error.message}`);
  }

  const identity = mapSettingsToAssistantStudioIdentity(settingsResult);

  const row = profileRes.data;
  if (!row) {
    return {
      hasBusinessProfileRow: false,
      identity,
      capability: null,
    };
  }

  return {
    hasBusinessProfileRow: true,
    identity,
    capability: mapRowToCapability(row as Database["public"]["Tables"]["studio_business_profiles"]["Row"]),
  };
}
