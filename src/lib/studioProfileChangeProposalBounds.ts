/**
 * Validate and format v1 **studio profile change proposal** wire shapes.
 * No persistence or apply — foundation for a future review → write path.
 */
import {
  STUDIO_BIZ_PROFILE_PROPOSAL_KEYS,
  STUDIO_PROFILE_CHANGE_PROPOSAL_SCHEMA_VERSION,
  STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS,
  type StudioProfileChangeProposalV1,
} from "../types/studioProfileChangeProposal.types.ts";

const RATIONALE_MAX = 8_000;
const PROPOSED_AT_RE = /^\d{4}-\d{2}-\d{2}T/;

const SETTINGS_KEY_SET = new Set<string>(STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS as readonly string[]);
const BIZ_KEY_SET = new Set<string>(STUDIO_BIZ_PROFILE_PROPOSAL_KEYS as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Rejects settings keys outside `STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS` (studio profile / identity only).
 */
export function validateStudioProfileChangeProposalV1(
  raw: unknown,
):
  | { ok: true; value: StudioProfileChangeProposalV1 }
  | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "proposal must be a JSON object" };
  }
  if (raw.schema_version !== STUDIO_PROFILE_CHANGE_PROPOSAL_SCHEMA_VERSION) {
    return { ok: false, error: "schema_version must be 1" };
  }
  if (raw.source !== "operator_assistant" && raw.source !== "operator" && raw.source !== "system") {
    return { ok: false, error: "invalid source" };
  }
  if (typeof raw.proposed_at !== "string" || !raw.proposed_at.trim() || !PROPOSED_AT_RE.test(raw.proposed_at.trim())) {
    return { ok: false, error: "proposed_at must be an ISO-8601 string" };
  }
  if (typeof raw.rationale !== "string" || !raw.rationale.trim()) {
    return { ok: false, error: "rationale is required" };
  }
  if (raw.rationale.length > RATIONALE_MAX) {
    return { ok: false, error: `rationale exceeds ${RATIONALE_MAX} characters` };
  }

  if (raw.settings_patch !== undefined) {
    if (!isPlainObject(raw.settings_patch)) {
      return { ok: false, error: "settings_patch must be an object" };
    }
    for (const k of Object.keys(raw.settings_patch)) {
      if (!SETTINGS_KEY_SET.has(k)) {
        return { ok: false, error: `settings_patch: unknown key "${k}"` };
      }
    }
  }

  if (raw.studio_business_profile_patch !== undefined) {
    if (!isPlainObject(raw.studio_business_profile_patch)) {
      return { ok: false, error: "studio_business_profile_patch must be an object" };
    }
    for (const k of Object.keys(raw.studio_business_profile_patch)) {
      if (!BIZ_KEY_SET.has(k)) {
        return { ok: false, error: `studio_business_profile_patch: unknown key "${k}"` };
      }
    }
  }

  if (Object.keys(raw).some((k) => !isProposalTopLevelKey(k))) {
    return { ok: false, error: "unknown top-level key" };
  }

  const value: StudioProfileChangeProposalV1 = {
    schema_version: STUDIO_PROFILE_CHANGE_PROPOSAL_SCHEMA_VERSION,
    source: raw.source,
    proposed_at: raw.proposed_at.trim(),
    rationale: raw.rationale.trim(),
    settings_patch: raw.settings_patch as StudioProfileChangeProposalV1["settings_patch"],
    studio_business_profile_patch: raw.studio_business_profile_patch as StudioProfileChangeProposalV1["studio_business_profile_patch"],
  };
  return { ok: true, value };
}

function isProposalTopLevelKey(k: string): boolean {
  return (
    k === "schema_version" ||
    k === "source" ||
    k === "proposed_at" ||
    k === "rationale" ||
    k === "settings_patch" ||
    k === "studio_business_profile_patch"
  );
}

const CLIP = 1_200;

function clipJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    if (s.length <= CLIP) return s;
    return `${s.slice(0, CLIP - 1)}…`;
  } catch {
    return "[unserializable]";
  }
}

/**
 * Human-readable lines for a **review** surface (read-only; no before/after until apply plumbing exists).
 */
export function formatStudioProfileChangeProposalForReview(proposal: StudioProfileChangeProposalV1): string[] {
  const lines: string[] = [
    `Source: ${proposal.source}`,
    `Proposed at: ${proposal.proposed_at}`,
    `Rationale: ${proposal.rationale}`,
  ];
  if (proposal.settings_patch && Object.keys(proposal.settings_patch).length > 0) {
    lines.push("Settings patch (studio profile / identity keys only):");
    for (const [k, v] of Object.entries(proposal.settings_patch)) {
      lines.push(`  - ${k}: ${clipJson(v)}`);
    }
  } else {
    lines.push("Settings patch: (none)");
  }
  if (proposal.studio_business_profile_patch && Object.keys(proposal.studio_business_profile_patch).length > 0) {
    lines.push("Business profile patch (finalize RPC top-level keys):");
    for (const [k, v] of Object.entries(proposal.studio_business_profile_patch)) {
      lines.push(`  - ${k}: ${clipJson(v)}`);
    }
  } else {
    lines.push("Business profile patch: (none)");
  }
  return lines;
}
