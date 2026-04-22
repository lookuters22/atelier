/**
 * Parse / build operator-assistant **studio_profile_change_proposal** actions (Ana slice).
 * Shared by the edge JSON parser and the widget normalizer (fail-closed).
 */
import { validateStudioProfileChangeProposalV1 } from "./studioProfileChangeProposalBounds.ts";
import {
  STUDIO_BIZ_PROFILE_PROPOSAL_KEYS,
  STUDIO_PROFILE_CHANGE_PROPOSAL_SCHEMA_VERSION,
  STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS,
  type StudioBusinessProfilePatchV1,
  type StudioProfileChangeProposalV1,
  type StudioProfileSettingsPatchV1,
} from "../types/studioProfileChangeProposal.types.ts";
import type { OperatorAssistantProposedActionStudioProfileChangeProposal } from "../types/operatorAssistantProposedAction.types.ts";

const RATIONALE_MAX = 8_000;

const SETTINGS_KEY_SET = new Set<string>(STUDIO_PROFILE_PROPOSAL_SETTINGS_KEYS as readonly string[]);
const BIZ_KEY_SET = new Set<string>(STUDIO_BIZ_PROFILE_PROPOSAL_KEYS as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function filterSettingsPatch(raw: unknown): StudioProfileSettingsPatchV1 | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (SETTINGS_KEY_SET.has(k)) {
      out[k] = raw[k];
    }
  }
  return Object.keys(out).length > 0 ? (out as StudioProfileSettingsPatchV1) : undefined;
}

function filterBusinessProfilePatch(raw: unknown): StudioBusinessProfilePatchV1 | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (BIZ_KEY_SET.has(k)) {
      out[k] = raw[k];
    }
  }
  return Object.keys(out).length > 0 ? (out as StudioBusinessProfilePatchV1) : undefined;
}

/**
 * Build the wire payload for `insertStudioProfileChangeProposal` at confirm time (fresh `proposed_at`).
 */
export function buildStudioProfileChangeProposalV1ForConfirm(
  p: OperatorAssistantProposedActionStudioProfileChangeProposal,
): StudioProfileChangeProposalV1 {
  const base: StudioProfileChangeProposalV1 = {
    schema_version: STUDIO_PROFILE_CHANGE_PROPOSAL_SCHEMA_VERSION,
    source: "operator_assistant",
    proposed_at: new Date().toISOString(),
    rationale: p.rationale,
  };
  if (p.settings_patch && Object.keys(p.settings_patch).length > 0) {
    base.settings_patch = p.settings_patch;
  }
  if (p.studio_business_profile_patch && Object.keys(p.studio_business_profile_patch).length > 0) {
    base.studio_business_profile_patch = p.studio_business_profile_patch;
  }
  return base;
}

/**
 * LLM + widget: validate proposed-action shape; ensure full `StudioProfileChangeProposalV1` validates when assembled for confirm.
 */
export function tryParseLlmProposedStudioProfileChange(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionStudioProfileChangeProposal }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "studio_profile_change_proposal") {
    return { ok: false, reason: "not a studio_profile_change_proposal" };
  }
  const o = item as Record<string, unknown>;
  if (typeof o.rationale !== "string" || !o.rationale.trim()) {
    return { ok: false, reason: "rationale is required" };
  }
  const rationale = o.rationale.trim();
  if (rationale.length > RATIONALE_MAX) {
    return { ok: false, reason: `rationale exceeds ${RATIONALE_MAX} characters` };
  }

  const settings_patch = o.settings_patch !== undefined ? filterSettingsPatch(o.settings_patch) : undefined;
  const studio_business_profile_patch =
    o.studio_business_profile_patch !== undefined ? filterBusinessProfilePatch(o.studio_business_profile_patch) : undefined;

  if (!settings_patch && !studio_business_profile_patch) {
    return { ok: false, reason: "at least one allowed settings_patch or studio_business_profile_patch key is required" };
  }

  const proposal: OperatorAssistantProposedActionStudioProfileChangeProposal = {
    kind: "studio_profile_change_proposal",
    rationale,
    ...(settings_patch ? { settings_patch } : {}),
    ...(studio_business_profile_patch ? { studio_business_profile_patch } : {}),
  };

  const assembled = buildStudioProfileChangeProposalV1ForConfirm(proposal);
  const v = validateStudioProfileChangeProposalV1(assembled);
  if (!v.ok) {
    return { ok: false, reason: v.error };
  }
  return { ok: true, value: proposal };
}

/**
 * Client-side normalizer (same rules as the edge `parseOperatorStudioAssistantLlmResponse` path).
 */
export function normalizeStudioProfileChangeProposalsForWidget(
  raw: unknown,
): OperatorAssistantProposedActionStudioProfileChangeProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionStudioProfileChangeProposal[] = [];
  for (const x of raw) {
    const p = tryParseLlmProposedStudioProfileChange(x);
    if (p.ok) {
      out.push(p.value);
    }
  }
  return out;
}
