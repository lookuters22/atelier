import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PlaybookRuleCandidateReviewReceipt } from "@/types/playbookRuleCandidateReview.types";
import { getSupabaseEdgeFunctionErrorMessage } from "@/lib/supabaseEdgeFunctionErrorMessage";

type ReviewAction = "approve" | "reject";

type EdgeSuccessBody = {
  ok: true;
  receipt: PlaybookRuleCandidateReviewReceipt;
};

function isEdgeSuccessBody(v: unknown): v is EdgeSuccessBody {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.ok === true && o.receipt !== null && typeof o.receipt === "object";
}

/**
 * Review a pending playbook rule candidate via the `review-playbook-rule-candidate` edge function
 * (wraps `review_playbook_rule_candidate` RPC with JWT + service client).
 */
export async function reviewPlaybookRuleCandidate(
  supabase: SupabaseClient<Database>,
  params: { candidateId: string; action: ReviewAction },
): Promise<{ receipt: PlaybookRuleCandidateReviewReceipt; error: null } | { receipt: null; error: string }> {
  const { data, error } = await supabase.functions.invoke<unknown>("review-playbook-rule-candidate", {
    body: {
      candidate_id: params.candidateId,
      action: params.action,
    },
  });

  if (error) {
    const msg = await getSupabaseEdgeFunctionErrorMessage(error, data);
    return { receipt: null, error: msg };
  }

  if (isEdgeSuccessBody(data)) {
    return { receipt: data.receipt, error: null };
  }

  return { receipt: null, error: "Unexpected response from review" };
}
