/**
 * Enqueue Gmail label fast-lane sync (Inngest). JWT + tenant check; no direct Gmail calls here.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import {
  GMAIL_LABEL_SYNC_V1_EVENT,
  GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION,
  inngest,
} from "../_shared/inngest.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const wallStartedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    logA4EdgeOpLatencyV1({
      edge: "gmail-enqueue-label-sync",
      action: "method_not_allowed",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 405,
    });
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const startedAt = Date.now();
    const photographerId = await requirePhotographerIdFromJwt(req);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      logA4EdgeOpLatencyV1({
        edge: "gmail-enqueue-label-sync",
        action: "invalid_json",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 400,
      });
      return json({ error: "Invalid JSON body" }, 400);
    }

    const connectedAccountId =
      typeof body.connected_account_id === "string" ? body.connected_account_id.trim() : "";
    const labelId = typeof body.label_id === "string" ? body.label_id.trim() : "";
    const labelName = typeof body.label_name === "string" ? body.label_name.trim() : "";

    const jsonWithLog = (
      bodyOut: Record<string, unknown>,
      status: number,
      obs?: Record<string, unknown>,
    ) => {
      logA4EdgeOpLatencyV1({
        edge: "gmail-enqueue-label-sync",
        action: "enqueue_label_sync",
        ok: status < 400,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        connected_account_id: connectedAccountId || undefined,
        label_id: labelId || undefined,
        http_status: status,
        ...obs,
      });
      return json(bodyOut, status);
    };

    if (!connectedAccountId || !UUID_RE.test(connectedAccountId)) {
      return jsonWithLog({ error: "connected_account_id must be a valid UUID" }, 400);
    }
    if (!labelId) {
      return jsonWithLog({ error: "label_id required" }, 400);
    }
    if (!labelName) {
      return jsonWithLog({ error: "label_name required" }, 400);
    }

    const { data: row, error } = await supabaseAdmin
      .from("connected_accounts")
      .select("id")
      .eq("id", connectedAccountId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (error || !row?.id) {
      return jsonWithLog({ error: "Connected account not found" }, 404);
    }

    const sendResult = await inngest.send({
      name: GMAIL_LABEL_SYNC_V1_EVENT,
      data: {
        schemaVersion: GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION,
        photographerId,
        connectedAccountId,
        labelId,
        labelName,
      },
    });

    return jsonWithLog(
      {
        ok: true as const,
        enqueued: true,
        event: GMAIL_LABEL_SYNC_V1_EVENT,
        schemaVersion: GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION,
        inngestAppId: "atelier-os",
        ids: sendResult.ids,
      },
      200,
      { inngest_ids: sendResult.ids },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized" || msg.startsWith("Missing or invalid")) {
      logA4EdgeOpLatencyV1({
        edge: "gmail-enqueue-label-sync",
        action: "auth",
        ok: false,
        duration_ms: Date.now() - wallStartedAt,
        http_status: 401,
        outcome: msg,
      });
      return json({ error: msg }, 401);
    }
    console.error("[gmail-enqueue-label-sync]", msg);
    logA4EdgeOpLatencyV1({
      edge: "gmail-enqueue-label-sync",
      action: "exception",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 500,
      outcome: msg,
    });
    return json({ error: msg }, 500);
  }
});
