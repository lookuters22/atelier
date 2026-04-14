/**
 * JWT-authenticated edge for reviewing playbook rule candidates (approve / reject / supersede).
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { mapPlaybookRuleCandidateReviewReceipt } from "../_shared/learning/mapPlaybookRuleCandidateReviewReceipt.ts";
import {
  parseReviewPlaybookRuleCandidateHttpBody,
  toReviewPlaybookRuleCandidateRpcArgs,
  validateReviewPlaybookRuleCandidateUuids,
} from "../_shared/learning/reviewPlaybookRuleCandidateRpc.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const photographerId = await requirePhotographerIdFromJwt(req);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = parseReviewPlaybookRuleCandidateHttpBody(body);
    if (!parsed) {
      return json({ error: "candidate_id, action (approve|reject|supersede) required" }, 400);
    }

    const uuidCheck = validateReviewPlaybookRuleCandidateUuids(parsed);
    if (!uuidCheck.ok) {
      return json({ error: uuidCheck.error }, 400);
    }

    const rpcArgs = toReviewPlaybookRuleCandidateRpcArgs(photographerId, parsed);

    const { data, error } = await supabaseAdmin.rpc("review_playbook_rule_candidate", rpcArgs);

    if (error) {
      const msg = error.message ?? String(error);
      if (msg.includes("tenant mismatch")) {
        return json({ error: "Forbidden" }, 403);
      }
      if (msg.includes("candidate not found")) {
        return json({ error: "Candidate not found" }, 404);
      }
      if (msg.includes("candidate not in candidate status")) {
        return json({ error: "Candidate is not pending review" }, 409);
      }
      console.error("[review-playbook-rule-candidate]", msg);
      return json({ error: msg }, 500);
    }

    if (data === null || typeof data !== "object") {
      return json({ error: "Invalid RPC response" }, 500);
    }

    let receipt;
    try {
      receipt = mapPlaybookRuleCandidateReviewReceipt(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[review-playbook-rule-candidate] receipt parse", msg);
      return json({ error: "Invalid receipt payload" }, 500);
    }
    return json({ ok: true as const, receipt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized" || msg.startsWith("Missing or invalid")) {
      return json({ error: msg }, 401);
    }
    console.error("[review-playbook-rule-candidate]", msg);
    return json({ error: msg }, 500);
  }
});
