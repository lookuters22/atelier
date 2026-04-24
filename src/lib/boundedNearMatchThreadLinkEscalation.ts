/** Bounded near-match escalation: `request_thread_wedding_link` + `bounded_matchmaker_near_match`. */

export const BOUNDED_NEAR_MATCH_THREAD_LINK_ACTION_KEY = "request_thread_wedding_link";
export const BOUNDED_NEAR_MATCH_THREAD_LINK_REASON_CODE = "bounded_matchmaker_near_match";

export function isBoundedNearMatchThreadLinkEscalation(
  actionKey: string | null | undefined,
  reasonCode: string | null | undefined,
): boolean {
  return (
    actionKey === BOUNDED_NEAR_MATCH_THREAD_LINK_ACTION_KEY &&
    reasonCode === BOUNDED_NEAR_MATCH_THREAD_LINK_REASON_CODE
  );
}

export type BoundedNearMatchDecisionFields = {
  candidateWeddingId: string;
  confidenceScore: number | null;
  matchmakerReasoning: string;
};

export function parseBoundedNearMatchDecisionJustification(
  decisionJustification: unknown,
): BoundedNearMatchDecisionFields | null {
  if (
    decisionJustification == null ||
    typeof decisionJustification !== "object" ||
    Array.isArray(decisionJustification)
  ) {
    return null;
  }
  const o = decisionJustification as Record<string, unknown>;
  const candidateWeddingId =
    typeof o.candidate_wedding_id === "string" ? o.candidate_wedding_id.trim() : "";
  if (!candidateWeddingId) return null;

  let confidenceScore: number | null = null;
  if (typeof o.confidence_score === "number" && Number.isFinite(o.confidence_score)) {
    confidenceScore = o.confidence_score;
  } else if (typeof o.confidence_score === "string" && o.confidence_score.trim() !== "") {
    const n = Number(o.confidence_score);
    confidenceScore = Number.isFinite(n) ? n : null;
  }

  const matchmakerReasoning =
    typeof o.matchmaker_reasoning === "string" ? o.matchmaker_reasoning.trim() : "";

  return { candidateWeddingId, confidenceScore, matchmakerReasoning };
}

export function defaultBoundedNearMatchLinkResolutionSummary(candidateWeddingId: string): string {
  const short = candidateWeddingId.slice(0, 8);
  return `Approved near-match filing: linked this thread to project ${short}… (${candidateWeddingId}).`;
}
