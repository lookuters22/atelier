import type { Database } from "./database.types.ts";

export type PlaybookRuleCandidateReviewAction = "approve" | "reject" | "supersede";

export type DecisionMode = Database["public"]["Enums"]["decision_mode"];

/**
 * Typed machine-readable receipt from `review_playbook_rule_candidate` (JSON-RPC / edge).
 * Snake_case mirrors Postgres `jsonb` keys for stable wire format.
 */
export type PlaybookRuleCandidateReviewReceipt =
  | PlaybookRuleCandidateApproveReceipt
  | PlaybookRuleCandidateRejectReceipt
  | PlaybookRuleCandidateSupersedeReceipt;

export type PlaybookRuleCandidateApproveReceipt = {
  action: "approve";
  candidate_id: string;
  review_status: "approved";
  playbook_rule_id: string;
  used_overrides: boolean;
  approved_action_key: string;
  approved_decision_mode: DecisionMode;
  approved_instruction: string;
  approved_topic: string;
};

export type PlaybookRuleCandidateRejectReceipt = {
  action: "reject";
  candidate_id: string;
  review_status: "rejected";
};

export type PlaybookRuleCandidateSupersedeReceipt = {
  action: "supersede";
  candidate_id: string;
  review_status: "superseded";
  superseded_by_candidate_id: string | null;
};
