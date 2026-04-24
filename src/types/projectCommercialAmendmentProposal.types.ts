/**
 * v1 **project commercial amendment** proposal wire shape (review-first; bounded categories + deltas).
 *
 * **Enqueue:** `project_commercial_amendment_proposals` after operator confirm. Not advisory memory,
 * not playbook policy, not a one-off case exception — a structured project commercial record.
 */
export const PROJECT_COMMERCIAL_AMENDMENT_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type ProjectCommercialAmendmentProposalSource = "operator_assistant" | "operator" | "system";

export const PROJECT_COMMERCIAL_AMENDMENT_CHANGE_CATEGORIES = [
  "pricing",
  "scope",
  "timeline",
  "team",
  "payment_schedule",
] as const;

export type ProjectCommercialAmendmentChangeCategory =
  (typeof PROJECT_COMMERCIAL_AMENDMENT_CHANGE_CATEGORIES)[number];

export type ProjectCommercialAmendmentDeltasV1 = {
  pricing?: { summary: string };
  scope?: { additions: string[]; removals: string[] };
  timeline?: { summary: string };
  team?: { summary: string; headcount_delta?: number };
  payment_schedule?: { summary: string };
};

export type ProjectCommercialAmendmentProposalV1 = {
  schema_version: typeof PROJECT_COMMERCIAL_AMENDMENT_PROPOSAL_SCHEMA_VERSION;
  source: ProjectCommercialAmendmentProposalSource;
  /** ISO 8601 */
  proposed_at: string;
  rationale: string;
  wedding_id: string;
  client_thread_id?: string | null;
  change_categories: ProjectCommercialAmendmentChangeCategory[];
  deltas: ProjectCommercialAmendmentDeltasV1;
};
