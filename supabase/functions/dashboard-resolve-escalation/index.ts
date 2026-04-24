/**
 * Canonical JWT edge for operator escalation resolution (dashboard + any API client using Supabase JWT).
 * A3: enqueue durable Inngest work — classifier + RPC run off the Edge request path.
 *
 * POST { escalation_id, resolution_summary, photographer_reply_raw? }
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import {
  OPS_ESCALATION_RESOLUTION_V1_EVENT,
  OPS_ESCALATION_RESOLUTION_V1_SCHEMA_VERSION,
  inngest,
} from "../_shared/inngest.ts";
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

    const escalationId = typeof body.escalation_id === "string" ? body.escalation_id.trim() : "";
    const resolutionSummaryRaw = typeof body.resolution_summary === "string" ? body.resolution_summary.trim() : "";
    const photographerReplyRawIn =
      typeof body.photographer_reply_raw === "string" ? body.photographer_reply_raw.trim() : "";
    const approveBoundedNearMatchThreadLink =
      body.approve_bounded_near_match_thread_link === true ||
      body.approve_bounded_near_match_thread_link === "true";

    if (!escalationId) {
      return json({ error: "escalation_id required" }, 400);
    }
    if (!resolutionSummaryRaw) {
      return json({ error: "resolution_summary required" }, 400);
    }

    const photographerReplyRaw =
      photographerReplyRawIn.length > 0 ? photographerReplyRawIn : resolutionSummaryRaw;

    const { data: esc, error: escErr } = await supabaseAdmin
      .from("escalation_requests")
      .select("id, status, action_key, reason_code, thread_id, decision_justification")
      .eq("id", escalationId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (escErr) {
      return json({ error: escErr.message }, 500);
    }
    if (!esc) {
      return json({ error: "Escalation not found" }, 404);
    }
    if (esc.status !== "open") {
      return json({ error: "Escalation is not open" }, 409);
    }

    if (approveBoundedNearMatchThreadLink) {
      if (esc.action_key !== "request_thread_wedding_link" || esc.reason_code !== "bounded_matchmaker_near_match") {
        return json({ error: "not_bounded_near_match_thread_link_escalation" }, 400);
      }
      if (!esc.thread_id) {
        return json({ error: "escalation_missing_thread_id" }, 400);
      }
      const dj = esc.decision_justification as Record<string, unknown> | null;
      const cand =
        dj && typeof dj["candidate_wedding_id"] === "string" ? dj["candidate_wedding_id"].trim() : "";
      if (!cand) {
        return json({ error: "candidate_wedding_id_missing" }, 400);
      }
    }

    const { data: existingJob, error: exErr } = await supabaseAdmin
      .from("escalation_resolution_jobs")
      .select("id, status")
      .eq("escalation_id", escalationId)
      .maybeSingle();

    if (exErr) {
      return json({ error: exErr.message }, 500);
    }

    if (existingJob) {
      const jst = String(existingJob.status ?? "").trim().toLowerCase();
      if (jst === "queued" || jst === "processing") {
        return json(
          {
            error: "resolution_already_queued",
            job_id: existingJob.id,
          },
          409,
        );
      }
      const { error: delErr } = await supabaseAdmin
        .from("escalation_resolution_jobs")
        .delete()
        .eq("id", existingJob.id);
      if (delErr) {
        return json({ error: delErr.message }, 500);
      }
    }

    const now = new Date().toISOString();
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("escalation_resolution_jobs")
      .insert({
        photographer_id: photographerId,
        escalation_id: escalationId,
        resolution_summary: resolutionSummaryRaw,
        photographer_reply_raw: photographerReplyRaw,
        approve_bounded_near_match_thread_link: approveBoundedNearMatchThreadLink,
        status: "queued",
        updated_at: now,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      if (insErr?.code === "23505" || insErr?.message?.includes("duplicate")) {
        const { data: row } = await supabaseAdmin
          .from("escalation_resolution_jobs")
          .select("id, status")
          .eq("escalation_id", escalationId)
          .maybeSingle();
        if (row?.id) {
          return json({ error: "resolution_already_queued", job_id: row.id }, 409);
        }
      }
      return json({ error: insErr?.message ?? "enqueue_failed" }, 500);
    }

    const jobId = inserted.id as string;

    try {
      await inngest.send({
        name: OPS_ESCALATION_RESOLUTION_V1_EVENT,
        data: {
          schemaVersion: OPS_ESCALATION_RESOLUTION_V1_SCHEMA_VERSION,
          photographerId,
          jobId,
          escalationId,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[dashboard-resolve-escalation] inngest send failed", msg);
      await supabaseAdmin.from("escalation_resolution_jobs").delete().eq("id", jobId);
      return json({ error: "enqueue_failed", detail: msg }, 500);
    }

    return json({
      ok: true as const,
      queued: true as const,
      job_id: jobId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized" || msg.startsWith("Missing or invalid")) {
      return json({ error: msg }, 401);
    }
    console.error("[dashboard-resolve-escalation]", msg);
    return json({ error: msg }, 500);
  }
});
