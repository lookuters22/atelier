import type { PlaybookRuleCandidateReviewReceipt } from "../../../../src/types/playbookRuleCandidateReview.types.ts";
import type { Database } from "../../../../src/types/database.types.ts";

type DecisionMode = Database["public"]["Enums"]["decision_mode"];

const DECISION_MODES: ReadonlySet<DecisionMode> = new Set([
  "auto",
  "draft_only",
  "ask_first",
  "forbidden",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string") {
    throw new Error(`mapPlaybookRuleCandidateReviewReceipt: missing or invalid ${key}`);
  }
  return v;
}

function optionalString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") {
    throw new Error(`mapPlaybookRuleCandidateReviewReceipt: invalid ${key}`);
  }
  return v;
}

function parseDecisionMode(raw: unknown): DecisionMode {
  if (typeof raw !== "string" || !DECISION_MODES.has(raw as DecisionMode)) {
    throw new Error("mapPlaybookRuleCandidateReviewReceipt: invalid approved_decision_mode");
  }
  return raw as DecisionMode;
}

/**
 * Maps RPC `jsonb` from `review_playbook_rule_candidate` to a typed receipt.
 */
export function mapPlaybookRuleCandidateReviewReceipt(
  raw: unknown,
): PlaybookRuleCandidateReviewReceipt {
  if (!isRecord(raw)) {
    throw new Error("mapPlaybookRuleCandidateReviewReceipt: expected object");
  }
  const action = raw.action;
  if (action === "reject") {
    return {
      action: "reject",
      candidate_id: requireString(raw, "candidate_id"),
      review_status: "rejected",
    };
  }
  if (action === "supersede") {
    return {
      action: "supersede",
      candidate_id: requireString(raw, "candidate_id"),
      review_status: "superseded",
      superseded_by_candidate_id: optionalString(raw, "superseded_by_candidate_id"),
    };
  }
  if (action === "approve") {
    const used = raw.used_overrides;
    if (typeof used !== "boolean") {
      throw new Error("mapPlaybookRuleCandidateReviewReceipt: missing used_overrides");
    }
    return {
      action: "approve",
      candidate_id: requireString(raw, "candidate_id"),
      review_status: "approved",
      playbook_rule_id: requireString(raw, "playbook_rule_id"),
      used_overrides: used,
      approved_action_key: requireString(raw, "approved_action_key"),
      approved_decision_mode: parseDecisionMode(raw.approved_decision_mode),
      approved_instruction: requireString(raw, "approved_instruction"),
      approved_topic: requireString(raw, "approved_topic"),
    };
  }
  throw new Error("mapPlaybookRuleCandidateReviewReceipt: unknown action");
}
