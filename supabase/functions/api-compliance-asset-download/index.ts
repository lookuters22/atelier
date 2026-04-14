/**
 * JWT-authenticated bridge: short-lived signed URL + metadata for a tenant compliance library object.
 * POST { library_key } — same auth pattern as api-resolve-draft.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import {
  parseOrchestratorComplianceAssetLibraryKey,
  prepareComplianceAssetOperatorDownload,
} from "../_shared/orchestrator/complianceAssetOperatorAccess.ts";
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

    const library_key = parseOrchestratorComplianceAssetLibraryKey(body.library_key);
    if (!library_key) {
      return json(
        { error: "library_key required", valid: ["public_liability_coi", "venue_security_compliance_packet"] },
        400,
      );
    }

    const result = await prepareComplianceAssetOperatorDownload(supabaseAdmin, photographerId, library_key);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return json({ error: "asset_not_in_storage", library_key }, 404);
      }
      return json({ error: "signed_url_failed", detail: result.error }, 500);
    }

    return json({
      ok: true,
      library_key: result.library_key,
      storage_bucket: result.storage_bucket,
      object_path: result.object_path,
      filename: result.filename,
      mime_guess: result.mime_guess,
      signed_url: result.signed_url,
      expires_in_seconds: result.expires_in_seconds,
      expires_at: result.expires_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    if (msg === "Unauthorized" || msg.includes("Authorization") || msg.includes("Missing")) {
      return json({ error: msg }, 401);
    }
    console.error("[api-compliance-asset-download]", e);
    return json({ error: "Internal error" }, 500);
  }
});
