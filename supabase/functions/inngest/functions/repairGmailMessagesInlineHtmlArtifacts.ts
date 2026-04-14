/**
 * A2/A4: Periodic repair — legacy `messages.metadata.gmail_import.body_html_sanitized` blobs → Storage +
 * `gmail_render_artifacts` + `render_html_ref` (bounded batch, idempotent, restartable).
 *
 * Opt-out: secret `GMAIL_INLINE_HTML_REPAIR_DISABLED=1` (hard kill) or DB pause via `gmail_repair_worker_state`.
 */
import { inngest } from "../../_shared/inngest.ts";
import { runGmailInlineHtmlRepairBatch } from "../../_shared/gmail/gmailRepairInlineHtmlToArtifact.ts";
import {
  fetchGmailRepairWorkerState,
  gmailRepairEnvDisabledForWorker,
  GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML,
  persistGmailRepairWorkerPauseSkip,
  persistGmailRepairWorkerRunResult,
} from "../../_shared/gmail/gmailRepairWorkerOps.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

const BATCH_LIMIT = 25;

export const repairGmailMessagesInlineHtmlArtifacts = inngest.createFunction(
  {
    id: "repair-gmail-messages-inline-html-artifacts",
    name: "Gmail — A2 repair inline HTML → render artifacts (cron)",
    concurrency: { limit: 1 },
  },
  { cron: "*/20 * * * *" },
  async ({ step }) => {
    return await step.run("repair-batch", async () => {
      const workerId = GMAIL_REPAIR_WORKER_MESSAGES_INLINE_HTML;
      const envDisabled = gmailRepairEnvDisabledForWorker(workerId);
      const row = await fetchGmailRepairWorkerState(supabaseAdmin, workerId);
      const dbPaused = row?.paused === true;

      if (envDisabled) {
        await persistGmailRepairWorkerPauseSkip(supabaseAdmin, workerId, "env");
        console.log(
          JSON.stringify({
            type: "gmail_inline_html_repair_batch_v1",
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
            type: "gmail_inline_html_repair_batch_v1",
            ts: new Date().toISOString(),
            worker_id: workerId,
            env_disabled: false,
            db_paused: true,
            skipped_due_to_pause: true,
          }),
        );
        return { ok: true as const, skipped_due_to_pause: true as const, env_disabled: false, db_paused: true };
      }

      const result = await runGmailInlineHtmlRepairBatch(supabaseAdmin, { limit: BATCH_LIMIT });

      await persistGmailRepairWorkerRunResult(supabaseAdmin, workerId, result);

      console.log(
        JSON.stringify({
          type: "gmail_inline_html_repair_batch_v1",
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
