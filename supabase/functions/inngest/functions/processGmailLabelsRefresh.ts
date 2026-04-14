/**
 * A3: Refresh cached Gmail labels.list for Settings — live Gmail API + token refresh off the Edge path.
 */
import { ensureValidGoogleAccessToken } from "../../_shared/gmail/ensureGoogleAccess.ts";
import { listGmailLabels } from "../../_shared/gmail/gmailThreads.ts";
import {
  GMAIL_LABELS_REFRESH_V1_EVENT,
  GMAIL_LABELS_REFRESH_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { logA4WorkerOpLatencyV1 } from "../../_shared/workerOpLatencyObservability.ts";

const WORKER_ID = "gmail-labels-refresh-cache";

export const processGmailLabelsRefresh = inngest.createFunction(
  {
    id: "gmail-labels-refresh-cache",
    name: "Gmail — labels cache refresh (A3)",
  },
  { event: GMAIL_LABELS_REFRESH_V1_EVENT },
  async ({ event, step, attempt, runId }) => {
    if (event.data.schemaVersion !== GMAIL_LABELS_REFRESH_V1_SCHEMA_VERSION) {
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

    const { photographerId, connectedAccountId } = event.data;
    const now = new Date().toISOString();

    await step.run("labels-list-and-cache", async () => {
      const t0 = Date.now();
      const base = {
        worker: WORKER_ID,
        action: "labels_list_and_cache",
        photographer_id: photographerId,
        connected_account_id: connectedAccountId,
        attempt,
        run_id: runId,
      };

      const { data: account, error: aErr } = await supabaseAdmin
        .from("connected_accounts")
        .select("id, photographer_id, token_expires_at")
        .eq("id", connectedAccountId)
        .eq("photographer_id", photographerId)
        .eq("provider", "google")
        .maybeSingle();

      if (aErr || !account) {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "connected_account",
          outcome: aErr?.message ?? "connected_account_not_found",
        });
        throw new Error(aErr?.message ?? "connected_account_not_found");
      }

      const { data: tok, error: tErr } = await supabaseAdmin
        .from("connected_account_oauth_tokens")
        .select("access_token, refresh_token")
        .eq("connected_account_id", connectedAccountId)
        .maybeSingle();

      if (tErr || !tok) {
        const msg = "OAuth tokens not found for this account";
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "oauth_tokens",
          outcome: msg,
        });
        await supabaseAdmin
          .from("connected_account_gmail_label_cache")
          .update({
            last_error: msg,
            refresh_in_progress: false,
            updated_at: now,
          })
          .eq("connected_account_id", connectedAccountId)
          .eq("photographer_id", photographerId);
        throw new Error(msg);
      }

      let accessToken: string;
      try {
        const ensured = await ensureValidGoogleAccessToken(
          {
            id: account.id,
            photographer_id: account.photographer_id,
            token_expires_at: account.token_expires_at,
          },
          { access_token: tok.access_token, refresh_token: tok.refresh_token },
        );
        accessToken = ensured.accessToken;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const errText = `Gmail authorization failed: ${msg}`.slice(0, 2000);
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "token_refresh",
          outcome: errText.slice(0, 300),
        });
        await supabaseAdmin
          .from("connected_account_gmail_label_cache")
          .update({
            last_error: errText,
            refresh_in_progress: false,
            updated_at: new Date().toISOString(),
          })
          .eq("connected_account_id", connectedAccountId)
          .eq("photographer_id", photographerId);
        throw new Error(errText);
      }

      let labels: unknown[];
      try {
        labels = await listGmailLabels(accessToken);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const errText = msg.slice(0, 2000);
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "labels_list",
          outcome: errText.slice(0, 300),
        });
        await supabaseAdmin
          .from("connected_account_gmail_label_cache")
          .update({
            last_error: errText,
            refresh_in_progress: false,
            updated_at: new Date().toISOString(),
          })
          .eq("connected_account_id", connectedAccountId)
          .eq("photographer_id", photographerId);
        throw new Error(errText);
      }

      const { error: upErr } = await supabaseAdmin.from("connected_account_gmail_label_cache").upsert(
        {
          connected_account_id: connectedAccountId,
          photographer_id: photographerId,
          labels_json: labels as unknown[],
          refreshed_at: new Date().toISOString(),
          last_error: null,
          refresh_in_progress: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connected_account_id" },
      );

      if (upErr) {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "cache_upsert",
          outcome: upErr.message,
        });
        throw new Error(upErr.message);
      }

      console.log(
        JSON.stringify({
          type: "gmail_labels_cache_refresh_v1",
          photographer_id: photographerId,
          connected_account_id: connectedAccountId,
          label_count: labels.length,
        }),
      );

      logA4WorkerOpLatencyV1({
        ...base,
        ok: true,
        duration_ms: Date.now() - t0,
        outcome: "completed",
        label_count: labels.length,
      });

      return { ok: true as const, count: labels.length };
    });

    return { ok: true as const };
  },
);
