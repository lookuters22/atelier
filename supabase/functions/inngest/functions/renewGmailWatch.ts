/**
 * Renew Gmail `users.watch` before expiration. Topic from env `GMAIL_PUBSUB_TOPIC_NAME` only.
 */
import { ensureValidGoogleAccessToken } from "../../_shared/gmail/ensureGoogleAccess.ts";
import { loadConnectedGoogleTokens } from "../../_shared/gmail/loadConnectedGoogleTokens.ts";
import { startGmailUsersWatch } from "../../_shared/gmail/gmailWatchHistory.ts";
import {
  GMAIL_WATCH_RENEW_V1_EVENT,
  GMAIL_WATCH_RENEW_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

export const renewGmailWatch = inngest.createFunction(
  {
    id: "renew-gmail-watch",
    name: "Gmail — renew users.watch (Pub/Sub)",
  },
  { event: GMAIL_WATCH_RENEW_V1_EVENT },
  async ({ event, step }) => {
    if (event.data.schemaVersion !== GMAIL_WATCH_RENEW_V1_SCHEMA_VERSION) {
      throw new Error(
        `renew_gmail_watch: schema_version_mismatch (got ${String(event.data.schemaVersion)})`,
      );
    }
    const { photographerId, connectedAccountId } = event.data;
    const topicName = Deno.env.get("GMAIL_PUBSUB_TOPIC_NAME")?.trim();
    if (!topicName) {
      throw new Error("renew_gmail_watch: GMAIL_PUBSUB_TOPIC_NAME_unset");
    }

    return await step.run("renew-watch", async () => {
      const { data: account, error: aErr } = await supabaseAdmin
        .from("connected_accounts")
        .select("id, photographer_id, token_expires_at")
        .eq("id", connectedAccountId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      if (aErr || !account) {
        throw new Error(
          aErr?.message ?? "renew_gmail_watch: connected_account not found for id + photographer_id",
        );
      }

      const loaded = await loadConnectedGoogleTokens(supabaseAdmin, {
        connectedAccountId,
        photographerId,
        accountRow: {
          id: account.id as string,
          photographer_id: account.photographer_id as string,
          token_expires_at: account.token_expires_at as string | null,
        },
      });

      if (!loaded.ok) {
        throw new Error(
          loaded.code === "oauth_tokens_not_found"
            ? "renew_gmail_watch: oauth tokens not found"
            : "renew_gmail_watch: connected_account not found for id + photographer_id",
        );
      }

      const ensured = await ensureValidGoogleAccessToken(
        {
          id: loaded.account.id,
          photographer_id: loaded.account.photographer_id,
          token_expires_at: loaded.account.token_expires_at,
        },
        loaded.tokens,
      );

      const w = await startGmailUsersWatch(ensured.accessToken, topicName);
      const now = new Date().toISOString();
      /** Gmail returns `expiration` as epoch millis (string or number); DB column is `timestamptz`. */
      const expMs = Number(w.expiration);
      const expIso = Number.isFinite(expMs) ? new Date(expMs).toISOString() : null;
      if (!expIso) {
        throw new Error("gmail_watch: invalid expiration for timestamptz");
      }

      const { data: prior } = await supabaseAdmin
        .from("connected_accounts")
        .select("gmail_last_history_id")
        .eq("id", connectedAccountId)
        .eq("photographer_id", photographerId)
        .maybeSingle();

      const patch: Record<string, unknown> = {
        gmail_watch_expiration: expIso,
        gmail_watch_last_renewed_at: now,
        updated_at: now,
      };
      const prevH = prior?.gmail_last_history_id as string | null | undefined;
      if (!prevH || String(prevH).trim().length === 0) {
        patch.gmail_last_history_id = w.historyId;
      }

      const { error: uErr } = await supabaseAdmin
        .from("connected_accounts")
        .update(patch)
        .eq("id", connectedAccountId)
        .eq("photographer_id", photographerId);
      if (uErr) throw uErr;

      return { ok: true as const, expiration: expIso, historyId: w.historyId };
    });
  },
);
