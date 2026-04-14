import type { Database } from "../../../../src/types/database.types.ts";

export type ReviewPlaybookRuleCandidateHttpBody = {
  candidate_id: string;
  action: "approve" | "reject" | "supersede";
  superseded_by_candidate_id?: string | null;
  override_instruction?: string | null;
  override_action_key?: string | null;
  override_decision_mode?: Database["public"]["Enums"]["decision_mode"] | null;
  override_topic?: string | null;
};

/** Canonical 8-4-4-4-12 hex UUID string (PostgreSQL-compatible). */
const UUID_STRING_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuidString(value: string): boolean {
  return UUID_STRING_RE.test(value.trim());
}

export function validateReviewPlaybookRuleCandidateUuids(
  body: ReviewPlaybookRuleCandidateHttpBody,
): { ok: true } | { ok: false; error: string } {
  if (!isValidUuidString(body.candidate_id)) {
    return { ok: false, error: "candidate_id must be a valid UUID" };
  }
  const supersede = body.superseded_by_candidate_id;
  if (supersede != null && supersede !== "" && !isValidUuidString(supersede)) {
    return { ok: false, error: "superseded_by_candidate_id must be a valid UUID" };
  }
  return { ok: true };
}

/**
 * Parses POST JSON body for `review-playbook-rule-candidate` (edge).
 * Returns null when required fields or action/override enum are invalid.
 */
export function parseReviewPlaybookRuleCandidateHttpBody(
  raw: Record<string, unknown>,
): ReviewPlaybookRuleCandidateHttpBody | null {
  const candidateId = typeof raw.candidate_id === "string" ? raw.candidate_id.trim() : "";
  const actionRaw = typeof raw.action === "string" ? raw.action.trim().toLowerCase() : "";
  if (!candidateId || !actionRaw) return null;
  if (actionRaw !== "approve" && actionRaw !== "reject" && actionRaw !== "supersede") {
    return null;
  }

  const supersededBy =
    typeof raw.superseded_by_candidate_id === "string" && raw.superseded_by_candidate_id.trim().length > 0
      ? raw.superseded_by_candidate_id.trim()
      : null;

  const decisionModes = new Set(["auto", "draft_only", "ask_first", "forbidden"]);
  let overrideDecision: ReviewPlaybookRuleCandidateHttpBody["override_decision_mode"] = null;
  if (raw.override_decision_mode !== undefined && raw.override_decision_mode !== null) {
    const d = typeof raw.override_decision_mode === "string" ? raw.override_decision_mode.trim() : "";
    if (!decisionModes.has(d)) return null;
    overrideDecision = d as ReviewPlaybookRuleCandidateHttpBody["override_decision_mode"];
  }

  return {
    candidate_id: candidateId,
    action: actionRaw,
    superseded_by_candidate_id: supersededBy,
    override_instruction:
      typeof raw.override_instruction === "string" ? raw.override_instruction : null,
    override_action_key: typeof raw.override_action_key === "string" ? raw.override_action_key : null,
    override_decision_mode: overrideDecision,
    override_topic: typeof raw.override_topic === "string" ? raw.override_topic : null,
  };
}

/**
 * Maps dashboard/edge JSON body to `review_playbook_rule_candidate` RPC args (Supabase naming).
 */
export function toReviewPlaybookRuleCandidateRpcArgs(
  photographerId: string,
  body: ReviewPlaybookRuleCandidateHttpBody,
): Database["public"]["Functions"]["review_playbook_rule_candidate"]["Args"] {
  return {
    p_photographer_id: photographerId,
    p_candidate_id: body.candidate_id.trim(),
    p_action: body.action,
    p_superseded_by_candidate_id: body.superseded_by_candidate_id ?? null,
    p_override_instruction: body.override_instruction ?? null,
    p_override_action_key: body.override_action_key ?? null,
    p_override_decision_mode: body.override_decision_mode ?? null,
    p_override_topic: body.override_topic ?? null,
  };
}
