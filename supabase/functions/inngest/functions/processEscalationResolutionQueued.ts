/**
 * A3: dashboard escalation resolution — `resolveOperatorEscalationResolution` off the Edge request path.
 */
import { resolveOperatorEscalationResolution } from "../../_shared/learning/resolveOperatorEscalationResolution.ts";
import type { ResolveOperatorEscalationResolutionError } from "../../_shared/learning/resolveOperatorEscalationResolution.ts";
import {
  OPS_ESCALATION_RESOLUTION_V1_EVENT,
  OPS_ESCALATION_RESOLUTION_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { logA4WorkerOpLatencyV1 } from "../../_shared/workerOpLatencyObservability.ts";

const WORKER_ID = "ops-escalation-resolution-queued";

function formatResolveError(err: ResolveOperatorEscalationResolutionError): string {
  try {
    return JSON.stringify(err).slice(0, 2000);
  } catch {
    return String(err).slice(0, 2000);
  }
}

export const processEscalationResolutionQueued = inngest.createFunction(
  {
    id: "ops-escalation-resolution-queued",
    name: "Ops — dashboard escalation resolution (A3 async)",
  },
  { event: OPS_ESCALATION_RESOLUTION_V1_EVENT },
  async ({ event, step, attempt, runId }) => {
    if (event.data.schemaVersion !== OPS_ESCALATION_RESOLUTION_V1_SCHEMA_VERSION) {
      logA4WorkerOpLatencyV1({
        worker: WORKER_ID,
        action: "handler",
        ok: true,
        duration_ms: 0,
        outcome: "skipped_schema",
        skipped_reason: "schema_version",
        attempt,
        run_id: runId,
      });
      return { skipped: true as const, reason: "schema_version" as const };
    }

    const { photographerId, jobId, escalationId } = event.data;

    await step.run("resolve-escalation", async () => {
      const t0 = Date.now();
      const base = {
        worker: WORKER_ID,
        action: "resolve_escalation",
        photographer_id: photographerId,
        job_id: jobId,
        escalation_id: escalationId,
        attempt,
        run_id: runId,
      };

      const now = new Date().toISOString();

      const { data: job, error: jobErr } = await supabaseAdmin
        .from("escalation_resolution_jobs")
        .select("id, status, resolution_summary, photographer_reply_raw")
        .eq("id", jobId)
        .eq("photographer_id", photographerId)
        .eq("escalation_id", escalationId)
        .maybeSingle();

      if (jobErr) {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "fetch_job",
          outcome: jobErr.message,
        });
        throw new Error(jobErr.message);
      }
      if (!job) {
        console.warn(
          JSON.stringify({
            type: "escalation_resolution_job_missing_v1",
            job_id: jobId,
            escalation_id: escalationId,
          }),
        );
        logA4WorkerOpLatencyV1({
          ...base,
          ok: true,
          duration_ms: Date.now() - t0,
          outcome: "skipped",
          skipped_reason: "job_missing",
        });
        return { skipped: true as const, reason: "job_missing" as const };
      }

      const st = String(job.status ?? "").trim().toLowerCase();
      if (st !== "queued" && st !== "processing") {
        console.warn(
          JSON.stringify({
            type: "escalation_resolution_job_skip_v1",
            job_id: jobId,
            status: st,
          }),
        );
        logA4WorkerOpLatencyV1({
          ...base,
          ok: true,
          duration_ms: Date.now() - t0,
          outcome: "skipped",
          skipped_reason: "not_active",
        });
        return { skipped: true as const, reason: "not_active" as const };
      }

      if (st === "queued") {
        const { error: markErr } = await supabaseAdmin
          .from("escalation_resolution_jobs")
          .update({ status: "processing", updated_at: now, last_error: null })
          .eq("id", jobId)
          .eq("photographer_id", photographerId)
          .eq("status", "queued");

        if (markErr) {
          logA4WorkerOpLatencyV1({
            ...base,
            ok: false,
            duration_ms: Date.now() - t0,
            failure_category: "mark_processing",
            outcome: markErr.message,
          });
          throw new Error(markErr.message);
        }
      }

      const resolutionSummary = String(job.resolution_summary ?? "").trim();
      const photographerReplyRaw = String(job.photographer_reply_raw ?? "").trim();
      if (!resolutionSummary) {
        await supabaseAdmin
          .from("escalation_resolution_jobs")
          .update({
            status: "failed",
            last_error: "missing_resolution_summary",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "validation",
          outcome: "missing_resolution_summary",
        });
        return { ok: false as const, terminal: true as const };
      }

      const result = await resolveOperatorEscalationResolution(supabaseAdmin, {
        photographerId,
        escalationId,
        resolutionSummary,
        photographerReplyRaw: photographerReplyRaw.length > 0 ? photographerReplyRaw : resolutionSummary,
      });

      if (!result.ok) {
        if (result.error.code === "ESCALATION_NOT_OPEN") {
          await supabaseAdmin.from("escalation_resolution_jobs").delete().eq("id", jobId);
          logA4WorkerOpLatencyV1({
            ...base,
            ok: true,
            duration_ms: Date.now() - t0,
            outcome: "deduped",
            skipped_reason: "escalation_not_open",
          });
          return { ok: true as const, deduped: true as const };
        }

        const errText = formatResolveError(result.error);
        await supabaseAdmin
          .from("escalation_resolution_jobs")
          .update({
            status: "failed",
            last_error: errText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("photographer_id", photographerId);

        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "resolve_failed",
          outcome: errText.slice(0, 300),
        });
        return { ok: false as const, terminal: true as const, error: errText };
      }

      await supabaseAdmin.from("escalation_resolution_jobs").delete().eq("id", jobId);

      logA4WorkerOpLatencyV1({
        ...base,
        ok: true,
        duration_ms: Date.now() - t0,
        outcome: "completed",
        resolve_mode: result.mode,
      });

      return {
        ok: true as const,
        mode: result.mode,
        escalationId: result.escalationId,
      };
    });

    return { ok: true as const };
  },
);
