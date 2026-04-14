import { exchangeGoogleRefreshToken, shouldRefreshAccessToken } from "./googleOAuthToken.ts";
import { supabaseAdmin } from "../supabase.ts";

export type ConnectedAccountRow = {
  id: string;
  photographer_id: string;
  token_expires_at: string | null;
};

export type TokenRow = {
  access_token: string;
  refresh_token: string | null;
};

/**
 * Returns a valid access token, refreshing before expiry when needed.
 * On refresh failure: sets sync_status=error and sync_error_summary on connected_accounts.
 */
export async function ensureValidGoogleAccessToken(
  account: ConnectedAccountRow,
  tokens: TokenRow,
): Promise<{ accessToken: string; expiresAtIso: string }> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET");
  }

  if (!shouldRefreshAccessToken(account.token_expires_at, undefined) && tokens.access_token) {
    return {
      accessToken: tokens.access_token,
      expiresAtIso: account.token_expires_at ?? new Date(Date.now() + 3600_000).toISOString(),
    };
  }

  if (!tokens.refresh_token) {
    await supabaseAdmin
      .from("connected_accounts")
      .update({
        sync_status: "error",
        sync_error_summary: "missing_refresh_token",
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    throw new Error("missing_refresh_token");
  }

  try {
    const refreshed = await exchangeGoogleRefreshToken(tokens.refresh_token, clientId, clientSecret);
    const expiresAtIso = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    await supabaseAdmin
      .from("connected_accounts")
      .update({
        token_expires_at: expiresAtIso,
        sync_status: "connected",
        sync_error_summary: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    await supabaseAdmin.from("connected_account_oauth_tokens").upsert(
      {
        connected_account_id: account.id,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connected_account_id" },
    );

    return { accessToken: refreshed.access_token, expiresAtIso };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
    await supabaseAdmin
      .from("connected_accounts")
      .update({
        sync_status: "error",
        sync_error_summary: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    throw e;
  }
}
