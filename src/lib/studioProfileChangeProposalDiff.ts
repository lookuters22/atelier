/**
 * Read-only current vs stored proposal patch — prepares a future reviewed apply path.
 * No merge/apply; "current" comes from the same read path as `fetchStudioProfileReviewData`.
 */
import type { PhotographerSettings } from "../types/photographerSettings.types.ts";
import {
  STUDIO_BIZ_PROFILE_PROPOSAL_KEYS,
  STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS,
  type StudioBusinessProfileProposalKey,
  type StudioProfileChangeProposalV1,
  type StudioProfileProposalSettingsKey,
} from "../types/studioProfileChangeProposal.types.ts";
import { normalizeInquiryFirstStepStyle } from "./inquiryFirstStepStyle.ts";
import { summarizeProfileJsonField } from "./profileFieldDisplay.ts";
import { parseStudioBaseLocation, type StudioBaseLocation } from "./studioBaseLocation.ts";

const BIZ_DISPLAY_MAX = 520;
const PROPOSED_JSON_FALLBACK = 1_200;

export type StudioProfileProposalDiffBase = {
  /** Parsed `photographers.settings` contract (same as identity mapping). */
  settings: Partial<PhotographerSettings>;
  /**
   * Live JSONB columns for proposal keys, or `null` when there is no `studio_business_profiles` row
   * (all business-profile "current" cells show as unset).
   */
  businessProfileJson: Record<string, unknown> | null;
};

export type StudioProfileProposalDiffLine = {
  group: "settings" | "business_profile";
  key: string;
  label: string;
  currentDisplay: string;
  proposedDisplay: string;
};

export type StudioProfileProposalDiffResult = {
  settings: StudioProfileProposalDiffLine[];
  businessProfile: StudioProfileProposalDiffLine[];
  isEmpty: boolean;
};

const SETTINGS_LABELS: Record<StudioProfileProposalSettingsKey, string> = {
  studio_name: "Studio name",
  manager_name: "Manager name",
  photographer_names: "Photographer names",
  timezone: "Timezone",
  currency: "Currency",
  base_location: "Base location (structured)",
  inquiry_first_step_style: "Inquiry first-step style",
};

const BIZ_LABELS: Record<StudioBusinessProfileProposalKey, string> = {
  service_types: "Service types",
  service_availability: "Service availability",
  geographic_scope: "Geographic scope (row JSON)",
  travel_policy: "Travel / policy",
  booking_scope: "Booking scope",
  client_types: "Client types",
  deliverable_types: "Deliverable types",
  lead_acceptance_rules: "Lead acceptance",
  language_support: "Language support",
  team_structure: "Team structure",
  extensions: "Extensions",
  source_type: "source_type",
};

function formatBaseLocationLine(loc: StudioBaseLocation | null | undefined): string | null {
  if (loc == null) return null;
  const label = typeof loc.label === "string" ? loc.label.trim() : "";
  if (!label) return null;
  const cc = typeof loc.country_code === "string" && loc.country_code.trim() ? loc.country_code.trim() : null;
  return cc ? `${label} (${cc})` : label;
}

function clipJsonish(v: unknown, max: number): string {
  if (v === undefined) return "—";
  try {
    const s = JSON.stringify(v);
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  } catch {
    return "[unserializable]";
  }
}

function currentSettingsDisplay(
  key: StudioProfileProposalSettingsKey,
  contract: Partial<PhotographerSettings>,
  unavailable: boolean,
): string {
  if (unavailable) return "—";
  if (key === "base_location") {
    if (contract.base_location === null) return "—";
    return formatBaseLocationLine(contract.base_location) ?? "—";
  }
  const v = contract[key];
  if (v == null) return "—";
  if (key === "inquiry_first_step_style") {
    return String(v).trim() || "—";
  }
  if (typeof v === "string") return v.trim() || "—";
  return summarizeProfileJsonField(v, PROPOSED_JSON_FALLBACK) ?? clipJsonish(v, PROPOSED_JSON_FALLBACK);
}

function proposedSettingsDisplay(key: StudioProfileProposalSettingsKey, value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "— (removes on apply)";

  if (key === "base_location") {
    const p = parseStudioBaseLocation(value);
    if (p) return formatBaseLocationLine(p) ?? clipJsonish(value, PROPOSED_JSON_FALLBACK);
    return summarizeProfileJsonField(value, PROPOSED_JSON_FALLBACK) ?? clipJsonish(value, PROPOSED_JSON_FALLBACK);
  }
  if (key === "inquiry_first_step_style") {
    if (typeof value === "string") return normalizeInquiryFirstStepStyle(value);
    return clipJsonish(value, PROPOSED_JSON_FALLBACK);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return summarizeProfileJsonField(value, PROPOSED_JSON_FALLBACK) ?? clipJsonish(value, PROPOSED_JSON_FALLBACK);
}

function currentBizDisplay(
  key: StudioBusinessProfileProposalKey,
  current: Record<string, unknown> | null,
  unavailable: boolean,
): string {
  if (unavailable) return "—";
  if (!current) return "— (no business profile row)";
  if (!Object.prototype.hasOwnProperty.call(current, key)) return "—";
  const v = current[key];
  if (v === null || v === undefined) return "—";
  return summarizeProfileJsonField(v, BIZ_DISPLAY_MAX) ?? clipJsonish(v, BIZ_DISPLAY_MAX);
}

function proposedBizDisplay(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "— (removes on apply)";
  return summarizeProfileJsonField(value, BIZ_DISPLAY_MAX) ?? clipJsonish(value, BIZ_DISPLAY_MAX);
}

/**
 * @param currentUnavailable - when the live profile failed to load; every "current" cell is "—" (proposed still shown).
 */
export function buildStudioProfileChangeProposalDiff(
  proposal: StudioProfileChangeProposalV1,
  base: StudioProfileProposalDiffBase,
  opts?: { currentUnavailable?: boolean },
): StudioProfileProposalDiffResult {
  const unavailable = Boolean(opts?.currentUnavailable);
  const contract = base.settings;
  const currentBiz = base.businessProfileJson;

  const settings: StudioProfileProposalDiffLine[] = [];
  const patch = proposal.settings_patch;
  if (patch) {
    for (const key of STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const v = patch[key];
      settings.push({
        group: "settings",
        key,
        label: SETTINGS_LABELS[key],
        currentDisplay: currentSettingsDisplay(key, contract, unavailable),
        proposedDisplay: proposedSettingsDisplay(key, v as unknown),
      });
    }
  }

  const businessProfile: StudioProfileProposalDiffLine[] = [];
  const bizPatch = proposal.studio_business_profile_patch;
  if (bizPatch) {
    for (const key of STUDIO_BIZ_PROFILE_PROPOSAL_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(bizPatch, key)) continue;
      const v = bizPatch[key];
      businessProfile.push({
        group: "business_profile",
        key,
        label: BIZ_LABELS[key],
        currentDisplay: currentBizDisplay(key, currentBiz, unavailable),
        proposedDisplay: proposedBizDisplay(v),
      });
    }
  }

  const isEmpty = settings.length === 0 && businessProfile.length === 0;
  return { settings, businessProfile, isEmpty };
}
