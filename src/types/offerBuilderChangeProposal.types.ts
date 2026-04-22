/**
 * v1 **offer-builder change proposal** wire shape (review-first; **no** arbitrary `puck_data` / Puck JSON).
 *
 * **Store:** `offer_builder_change_proposals` + reviewed apply via `apply_offer_builder_change_proposal_v1` (name / root title only).
 *
 * **v1 allowlist** — metadata only:
 * - `name` → `studio_offer_builder_projects.name` (list label in hub).
 * - `root_title` → `Data.root.props.title` (document title string) at apply time; **not** block-level edits.
 */
export const OFFER_BUILDER_CHANGE_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type OfferBuilderChangeProposalSource = "operator_assistant" | "operator" | "system";

export const OFFER_BUILDER_PROPOSAL_METADATA_KEYS = ["name", "root_title"] as const;

export type OfferBuilderMetadataProposalKey = (typeof OFFER_BUILDER_PROPOSAL_METADATA_KEYS)[number];

/**
 * Subset of offer-project surface Ana may propose; deep Puck `content` changes are out of scope for v1.
 */
export type OfferBuilderMetadataPatchV1 = {
  name?: string;
  /** Shown as document / investment-guide title; maps to Puck `root.props.title`. */
  root_title?: string;
};

export type OfferBuilderChangeProposalV1 = {
  schema_version: typeof OFFER_BUILDER_CHANGE_PROPOSAL_SCHEMA_VERSION;
  source: OfferBuilderChangeProposalSource;
  /** ISO 8601 */
  proposed_at: string;
  /** Operator-visible reason (not shown to end clients as an automation message). */
  rationale: string;
  /** `studio_offer_builder_projects.id` (this tenant). */
  project_id: string;
  /** At least one key must be present with a non-empty value after trim. */
  metadata_patch: OfferBuilderMetadataPatchV1;
};
