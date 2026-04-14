/**
 * A2/A4: Repair prepared `import_candidates.materialization_artifact` JSON — inline
 * `metadata.gmail_import.body_html_sanitized` → Storage + `gmail_render_artifacts` + nested `render_html_ref`.
 *
 * Opt-out: `GMAIL_IMPORT_CANDIDATE_ARTIFACT_HTML_REPAIR_DISABLED=1` or DB pause.
 */
import { inngest } from "../../_shared/inngest.ts";
import { runImportCandidateArtifactInlineHtmlRepairBatch } from "../../_shared/gmail/gmailRepairImportCandidateMaterializationArtifact.ts";
import {
  fetchGmailRepairWorkerState,
  gmailRepairEnvDisabledForWorker,
  GMAIL_REPAIR_WORKER_IMPORT_CANDIDATE_ARTIFACT,
  persistGmailRepairWorkerPauseSkip,
  persistGmailRepairWorkerRunResult,
} from "../../_shared/gmail/gmailRepairWorkerOps.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

const BATCH_LIMIT = 25;

export const repairGmailImportCandidateArtifactInlineHtml = inngest.createFunction(
  {
    id: "repair-gmail-import-candidate-artifact-inline-html",
    name: "Gmail — A2 repair import_candidate materialization_artifact inline HTML (cron)",
    concurrency: { limit: 1 },
  },
  { cron: "*/22 * * * *" },
  async ({ step }) => {
    return await step.run("repair-candidate-artifact-batch", async () => {
      const workerId = GMAIL_REPAIR_WORKER_IMPORT_CANDIDATE_ARTIFACT;
      const envDisabled = gmailRepairEnvDisabledForWorker(workerId);
      const row = await fetchGmailRepairWorkerState(supabaseAdmin, workerId);
      const dbPaused = row?.paused === true;

      if (envDisabled) {
        await persistGmailRepairWorkerPauseSkip(supabaseAdmin, workerId, "env");
        console.log(
          JSON.stringify({
            type: "gmail_import_candidate_artifact_inline_html_repair_batch_v1",
            ts: new Date().toISOString(),
            worker_id: workerId,
            env_disabled: true,
            db_paused: dbPaused,
            skipped_due_to_pause: true,
          }),
        );
        return { ok: true as const, skipped_due_to_pause: true as const, env_disabled: true, db_paused };
      }
      if (dbPaused) {
        await persistGmailRepairWorkerPauseSkip(supabaseAdmin, workerId, "db");
        console.log(
          JSON.stringify({
            type: "gmail_import_candidate_artifact_inline_html_repair_batch_v1",
            ts: new Date().toISOString(),
            worker_id: workerId,
            env_disabled: false,
            db_paused: true,
            skipped_due_to_pause: true,
          }),
        );
        return { ok: true as const, skipped_due_to_pause: true as const, env_disabled: false, db_paused: true };
      }

      const result = await runImportCandidateArtifactInlineHtmlRepairBatch(supabaseAdmin, {
        limit: BATCH_LIMIT,
      });

      await persistGmailRepairWorkerRunResult(supabaseAdmin, workerId, result);

      console.log(
        JSON.stringify({
          type: "gmail_import_candidate_artifact_inline_html_repair_batch_v1",
          ts: new Date().toISOString(),
          worker_id: workerId,
          env_disabled: false,
          db_paused: false,
          skipped_due_to_pause: false,
          scanned: result.scanned,
          migrated: result.migrated,
          skipped_already_ref: result.skipped_already_ref,
          skipped_artifact_fk: result.skipped_artifact_fk,
          skipped_no_inline: result.skipped_no_inline,
          failed: result.failed,
          failure_samples: result.failure_samples,
        }),
      );

      return { ok: true as const, skipped_due_to_pause: false as const, env_disabled: false, db_paused: false, ...result };
    });
  },
);
