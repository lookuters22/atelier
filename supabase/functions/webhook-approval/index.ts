/**
 * Approval Webhook — fires the approval/draft.approved event.
 *
 * Requires a valid Supabase JWT. Photographer tenant id is taken from `auth.getUser()`,
 * not from the request body (prevents client spoofing).
 *
 * Service-role ownership check: draft must belong to a thread owned by the JWT user
 * (same pattern as `api-resolve-draft`).
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { assertDraftOwnedByPhotographer } from "../_shared/assertDraftOwnedByPhotographer.ts";
import { emitDraftApprovedEvent } from "../_shared/emitDraftApprovedEvent.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  const wallStartedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    logA4EdgeOpLatencyV1({
      edge: "webhook-approval",
      action: "method_not_allowed",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 405,
    });
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const startedAt = Date.now();
    const body = await req.json();
    const draft_id = body.draft_id as string | undefined;

    if (!draft_id) {
      logA4EdgeOpLatencyV1({
        edge: "webhook-approval",
        action: "approve_emit",
        ok: false,
        duration_ms: Date.now() - startedAt,
        http_status: 400,
        outcome: "missing_draft_id",
      });
      return new Response(JSON.stringify({ error: "draft_id is required" }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const photographer_id = await requirePhotographerIdFromJwt(req);

    const owned = await assertDraftOwnedByPhotographer(draft_id, photographer_id);
    if (!owned) {
      logA4EdgeOpLatencyV1({
        edge: "webhook-approval",
        action: "approve_emit",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id,
        draft_id,
        http_status: 403,
        outcome: "not_owned",
      });
      return new Response(JSON.stringify({ error: "Draft not found or access denied" }), {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    await emitDraftApprovedEvent({
      draft_id,
      photographer_id,
      edited_body: null,
    });

    logA4EdgeOpLatencyV1({
      edge: "webhook-approval",
      action: "approve_emit",
      ok: true,
      duration_ms: Date.now() - startedAt,
      photographer_id,
      draft_id,
      http_status: 200,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const authFail =
      msg.includes("Unauthorized") ||
      msg.includes("Authorization") ||
      msg.includes("Missing SUPABASE");
    logA4EdgeOpLatencyV1({
      edge: "webhook-approval",
      action: "approve_emit",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: authFail ? 401 : 400,
      outcome: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: authFail ? 401 : 400,
      headers: CORS_HEADERS,
    });
  }
});
