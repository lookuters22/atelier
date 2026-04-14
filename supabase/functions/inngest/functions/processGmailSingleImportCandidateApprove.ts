/**
 * A3: single `import_candidate` approve — materialize + finalize off the Edge click path.
 */
import { executeSingleImportCandidateApprove } from "../../_shared/gmail/executeSingleImportCandidateApprove.ts";
import { logGmailImportEdgeV1 } from "../../_shared/gmail/gmailImportObservability.ts";
import {
  GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_EVENT,
  GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { logA4WorkerOpLatencyV1 } from "../../_shared/workerOpLatencyObservability.ts";

const WORKER_ID = "gmail-single-import-candidate-approve";

const CANDIDATE_SELECT =
  "id, photographer_id, connected_account_id, status, raw_provider_thread_id, subject, snippet, source_label_name, source_identifier, materialized_thread_id, materialization_prepare_status, materialization_artifact, gmail_label_import_group_id";

export const processGmailSingleImportCandidateApprove = inngest.createFunction(
  {
    id: "gmail-single-import-candidate-approve",
    name: "Gmail — single import candidate approve (A3 async)",
  },
  { event: GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_EVENT },
  async ({ event, step, attempt, runId }) => {
    if (event.data.schemaVersion !== GMAIL_SINGLE_IMPORT_CANDIDATE_APPROVE_V1_SCHEMA_VERSION) {
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

    const { photographerId, importCandidateId } = event.data;

    await step.run("materialize-and-finalize", async () => {
      const t0 = Date.now();
      const base = {
        worker: WORKER_ID,
        action: "materialize_and_finalize",
        photographer_id: photographerId,
        import_candidate_id: importCandidateId,
        attempt,
        run_id: runId,
      };

      const { data: row, error: fetchErr } = await supabaseAdmin
        .from("import_candidates")
        .select(CANDIDATE_SELECT)
        .eq("id", importCandidateId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (fetchErr || !row) {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "fetch_candidate",
          outcome: fetchErr?.message ?? "candidate_not_found",
        });
        throw new Error(fetchErr?.message ?? "candidate_not_found");
      }

      const st = String(row.status ?? "").trim().toLowerCase();
      if (st !== "approving") {
        /** Pending (reverted after failure), dismissed, merged, etc. — do not retry-loop. */
        console.warn(
          JSON.stringify({
            type: "gmail_single_approve_worker_skip_v1",
            import_candidate_id: importCandidateId,
            status: st,
          }),
        );
        logA4WorkerOpLatencyV1({
          ...base,
          ok: true,
          duration_ms: Date.now() - t0,
          outcome: "skipped",
          skipped_reason: "not_approving",
        });
        return { skipped: true as const, reason: "not_approving" as const };
      }

      const now = new Date().toISOString();
      const result = await executeSingleImportCandidateApprove(supabaseAdmin, {
        photographerId,
        importCandidateId,
        row: row as Record<string, unknown>,
        now,
      });

      if (!result.ok) {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "execute_approve_failed",
          outcome: result.error.slice(0, 300),
        });
        await supabaseAdmin
          .from("import_candidates")
          .update({
            status: "pending",
            import_approval_error: result.error.slice(0, 500),
            updated_at: now,
          })
          .eq("id", importCandidateId)
          .eq("photographer_id", photographerId);
        throw new Error(result.error);
      }

      logGmailImportEdgeV1({
        stage: "approve_single",
        photographer_id: photographerId,
        import_candidate_id: importCandidateId,
      });

      logA4WorkerOpLatencyV1({
        ...base,
        ok: true,
        duration_ms: Date.now() - t0,
        outcome: "completed",
        thread_id: result.threadId,
      });

      return { ok: true as const, threadId: result.threadId };
    });

    return { ok: true as const };
  },
);
