/**
 * Single service_role entry point for reading `connected_account_oauth_tokens` with tenant binding.
 * Always filters by both connected_account_id and photographer_id.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type LoadConnectedGoogleTokensAccountRow = {
  id: string;
  photographer_id: string;
  email: string;
  token_expires_at: string | null;
};

export type LoadConnectedGoogleTokensTokenRow = {
  access_token: string;
  refresh_token: string | null;
};

export type LoadConnectedGoogleTokensErrorCode =
  | "connected_account_not_found"
  | "oauth_tokens_not_found";

export type LoadConnectedGoogleTokensResult =
  | { ok: true; account: LoadConnectedGoogleTokensAccountRow; tokens: LoadConnectedGoogleTokensTokenRow }
  | { ok: false; error: string; code: LoadConnectedGoogleTokensErrorCode };

/** Caller-supplied account snapshot (e.g. after a scoped `connected_accounts` read). */
export type LoadConnectedGoogleTokensAccountRowInput = {
  id: string;
  photographer_id: string;
  token_expires_at: string | null;
  email?: string;
};

export type LoadConnectedGoogleTokensParams = {
  connectedAccountId: string;
  photographerId: string;
  /**
   * When the caller already loaded `connected_accounts` for this id + photographer + Google provider,
   * pass it to skip the duplicate account select.
   */
  accountRow?: LoadConnectedGoogleTokensAccountRowInput;
};

export async function loadConnectedGoogleTokens(
  supabaseAdmin: SupabaseClient,
  params: LoadConnectedGoogleTokensParams,
): Promise<LoadConnectedGoogleTokensResult> {
  const { connectedAccountId, photographerId, accountRow } = params;

  let account: LoadConnectedGoogleTokensAccountRow;

  if (accountRow) {
    if (accountRow.id !== connectedAccountId || accountRow.photographer_id !== photographerId) {
      return {
        ok: false,
        code: "connected_account_not_found",
        error: "Connected Google account not found",
      };
    }
    account = {
      id: accountRow.id,
      photographer_id: accountRow.photographer_id,
      email: accountRow.email !== undefined && accountRow.email !== null ? String(accountRow.email) : "",
      token_expires_at: accountRow.token_expires_at,
    };
  } else {
    const { data: acc, error: aErr } = await supabaseAdmin
      .from("connected_accounts")
      .select("id, photographer_id, email, token_expires_at")
      .eq("id", connectedAccountId)
      .eq("photographer_id", photographerId)
      .eq("provider", "google")
      .maybeSingle();

    if (aErr || !acc) {
      return {
        ok: false,
        code: "connected_account_not_found",
        error: "Connected Google account not found",
      };
    }

    account = {
      id: acc.id as string,
      photographer_id: acc.photographer_id as string,
      email: String(acc.email ?? ""),
      token_expires_at: acc.token_expires_at as string | null,
    };
  }

  const { data: tok, error: tErr } = await supabaseAdmin
    .from("connected_account_oauth_tokens")
    .select("access_token, refresh_token")
    .eq("connected_account_id", connectedAccountId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (tErr || !tok?.access_token) {
    return {
      ok: false,
      code: "oauth_tokens_not_found",
      error: "OAuth tokens not found for this account",
    };
  }

  return {
    ok: true,
    account,
    tokens: {
      access_token: tok.access_token as string,
      refresh_token: tok.refresh_token as string | null,
    },
  };
}
