/**
 * Parse / build operator-assistant **offer_builder_change_proposal** actions (Ana slice).
 * Shared by the edge JSON parser and the widget normalizer (fail-closed).
 */
import { validateOfferBuilderChangeProposalV1 } from "./offerBuilderChangeProposalBounds.ts";
import {
  OFFER_BUILDER_CHANGE_PROPOSAL_SCHEMA_VERSION,
  OFFER_BUILDER_PROPOSAL_METADATA_KEYS,
  type OfferBuilderChangeProposalV1,
  type OfferBuilderMetadataPatchV1,
} from "../types/offerBuilderChangeProposal.types.ts";
import type { OperatorAssistantProposedActionOfferBuilderChangeProposal } from "../types/operatorAssistantProposedAction.types.ts";

const RATIONALE_MAX = 8_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META_KEY_SET = new Set<string>(OFFER_BUILDER_PROPOSAL_METADATA_KEYS as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function filterMetadataPatch(raw: unknown): OfferBuilderMetadataPatchV1 | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: OfferBuilderMetadataPatchV1 = {};
  for (const k of Object.keys(raw)) {
    if (!META_KEY_SET.has(k)) continue;
    const v = raw[k];
    if (k === "name" && typeof v === "string") {
      out.name = v;
    }
    if (k === "root_title" && typeof v === "string") {
      out.root_title = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build the wire payload for `insertOfferBuilderChangeProposal` at confirm time (fresh `proposed_at`).
 */
export function buildOfferBuilderChangeProposalV1ForConfirm(
  p: OperatorAssistantProposedActionOfferBuilderChangeProposal,
): OfferBuilderChangeProposalV1 {
  const metadata_patch: OfferBuilderMetadataPatchV1 = {};
  if (p.metadata_patch.name !== undefined) metadata_patch.name = p.metadata_patch.name;
  if (p.metadata_patch.root_title !== undefined) metadata_patch.root_title = p.metadata_patch.root_title;
  return {
    schema_version: OFFER_BUILDER_CHANGE_PROPOSAL_SCHEMA_VERSION,
    source: "operator_assistant",
    proposed_at: new Date().toISOString(),
    rationale: p.rationale,
    project_id: p.project_id.trim(),
    metadata_patch,
  };
}

/**
 * LLM + widget: validate proposed-action shape; ensure full `OfferBuilderChangeProposalV1` validates when assembled for confirm.
 */
export function tryParseLlmProposedOfferBuilderChange(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionOfferBuilderChangeProposal }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "offer_builder_change_proposal") {
    return { ok: false, reason: "not an offer_builder_change_proposal" };
  }
  const o = item as Record<string, unknown>;
  if (typeof o.rationale !== "string" || !o.rationale.trim()) {
    return { ok: false, reason: "rationale is required" };
  }
  const rationale = o.rationale.trim();
  if (rationale.length > RATIONALE_MAX) {
    return { ok: false, reason: `rationale exceeds ${RATIONALE_MAX} characters` };
  }
  if (typeof o.project_id !== "string" || !o.project_id.trim()) {
    return { ok: false, reason: "project_id is required" };
  }
  const project_id = o.project_id.trim();
  if (!UUID_RE.test(project_id)) {
    return { ok: false, reason: "project_id must be a UUID" };
  }
  if (!isPlainObject(o.metadata_patch)) {
    return { ok: false, reason: "metadata_patch must be an object" };
  }
  const metadata_patch = filterMetadataPatch(o.metadata_patch);
  if (!metadata_patch) {
    return { ok: false, reason: "metadata_patch must include at least one allowlisted key with a string" };
  }

  const proposal: OperatorAssistantProposedActionOfferBuilderChangeProposal = {
    kind: "offer_builder_change_proposal",
    rationale,
    project_id,
    metadata_patch,
  };

  const assembled = buildOfferBuilderChangeProposalV1ForConfirm(proposal);
  const v = validateOfferBuilderChangeProposalV1(assembled);
  if (!v.ok) {
    return { ok: false, reason: v.error };
  }
  return { ok: true, value: proposal };
}

/**
 * Client-side normalizer (same rules as the edge `parseOperatorStudioAssistantLlmResponse` path).
 */
export function normalizeOfferBuilderChangeProposalsForWidget(
  raw: unknown,
): OperatorAssistantProposedActionOfferBuilderChangeProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionOfferBuilderChangeProposal[] = [];
  for (const x of raw) {
    const p = tryParseLlmProposedOfferBuilderChange(x);
    if (p.ok) {
      out.push(p.value);
    }
  }
  return out;
}
