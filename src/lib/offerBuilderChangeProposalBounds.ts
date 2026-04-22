/**
 * Validate v1 offer-builder change proposals. No persistence, enqueue, or apply — foundation only.
 */
import {
  OFFER_BUILDER_CHANGE_PROPOSAL_SCHEMA_VERSION,
  OFFER_BUILDER_PROPOSAL_METADATA_KEYS,
  type OfferBuilderChangeProposalV1,
  type OfferBuilderMetadataPatchV1,
} from "../types/offerBuilderChangeProposal.types.ts";

const RATIONALE_MAX = 8_000;
const NAME_MAX = 200;
const ROOT_TITLE_MAX = 500;
const PROPOSED_AT_RE = /^\d{4}-\d{2}-\d{2}T/;

/** Relaxed UUID (v1) — match project ids from DB. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const META_KEY_SET = new Set<string>(OFFER_BUILDER_PROPOSAL_METADATA_KEYS as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function nonEmpty(s: string | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * True if patch has at least one allowed key with a non-empty string after trim.
 */
export function offerBuilderMetadataPatchHasEffect(patch: OfferBuilderMetadataPatchV1): boolean {
  if (nonEmpty(patch.name)) return true;
  if (nonEmpty(patch.root_title)) return true;
  return false;
}

/**
 * Rejects keys outside v1 allowlist, oversized strings, and empty patches.
 */
export function validateOfferBuilderChangeProposalV1(
  raw: unknown,
): { ok: true; value: OfferBuilderChangeProposalV1 } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "proposal must be a JSON object" };
  }
  if (raw.schema_version !== OFFER_BUILDER_CHANGE_PROPOSAL_SCHEMA_VERSION) {
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
  if (typeof raw.project_id !== "string" || !raw.project_id.trim()) {
    return { ok: false, error: "project_id is required" };
  }
  const pid = raw.project_id.trim();
  if (!UUID_RE.test(pid)) {
    return { ok: false, error: "project_id must be a UUID" };
  }
  if (!isPlainObject(raw.metadata_patch)) {
    return { ok: false, error: "metadata_patch must be an object" };
  }
  for (const k of Object.keys(raw.metadata_patch)) {
    if (!META_KEY_SET.has(k)) {
      return { ok: false, error: `metadata_patch: unknown key "${k}"` };
    }
  }
  const mp = raw.metadata_patch as Record<string, unknown>;
  if (mp.name !== undefined) {
    if (typeof mp.name !== "string") {
      return { ok: false, error: "metadata_patch.name must be a string" };
    }
    if (mp.name.length > NAME_MAX) {
      return { ok: false, error: `metadata_patch.name exceeds ${NAME_MAX} characters` };
    }
  }
  if (mp.root_title !== undefined) {
    if (typeof mp.root_title !== "string") {
      return { ok: false, error: "metadata_patch.root_title must be a string" };
    }
    if (mp.root_title.length > ROOT_TITLE_MAX) {
      return { ok: false, error: `metadata_patch.root_title exceeds ${ROOT_TITLE_MAX} characters` };
    }
  }

  const metadata_patch: OfferBuilderMetadataPatchV1 = {};
  if (mp.name !== undefined) metadata_patch.name = mp.name.trim();
  if (mp.root_title !== undefined) metadata_patch.root_title = mp.root_title.trim();

  if (!offerBuilderMetadataPatchHasEffect(metadata_patch)) {
    return { ok: false, error: "metadata_patch must change at least one of name or root_title" };
  }

  if (Object.keys(raw).some((k) => !isProposalTopLevelKey(k))) {
    return { ok: false, error: "unknown top-level key" };
  }

  const value: OfferBuilderChangeProposalV1 = {
    schema_version: OFFER_BUILDER_CHANGE_PROPOSAL_SCHEMA_VERSION,
    source: raw.source,
    proposed_at: raw.proposed_at.trim(),
    rationale: raw.rationale.trim(),
    project_id: pid,
    metadata_patch,
  };
  return { ok: true, value };
}

function isProposalTopLevelKey(k: string): boolean {
  return (
    k === "schema_version" ||
    k === "source" ||
    k === "proposed_at" ||
    k === "rationale" ||
    k === "project_id" ||
    k === "metadata_patch"
  );
}

const CLIP = 1_200;

function clipString(s: string): string {
  if (s.length <= CLIP) return s;
  return `${s.slice(0, CLIP - 1)}…`;
}

/**
 * Human-readable lines for a future **review** surface (read-only; no before/after merge until apply).
 */
export function formatOfferBuilderChangeProposalForReview(proposal: OfferBuilderChangeProposalV1): string[] {
  const lines: string[] = [
    `Source: ${proposal.source}`,
    `Proposed at: ${proposal.proposed_at}`,
    `Project id: ${proposal.project_id}`,
    `Rationale: ${proposal.rationale}`,
    "Metadata patch (v1 allowlist: name, root_title only; no block / Puck content edits):",
  ];
  if (proposal.metadata_patch.name != null) {
    lines.push(`  - name: ${clipString(proposal.metadata_patch.name)}`);
  }
  if (proposal.metadata_patch.root_title != null) {
    lines.push(`  - root_title: ${clipString(proposal.metadata_patch.root_title)}`);
  }
  return lines;
}
