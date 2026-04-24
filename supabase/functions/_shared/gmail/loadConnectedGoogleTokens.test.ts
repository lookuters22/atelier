import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { loadConnectedGoogleTokens } from "./loadConnectedGoogleTokens.ts";

function createSupabaseMock(handlers: {
  account?: { data: Record<string, unknown> | null; error?: { message: string } | null };
  tokens?: { data: Record<string, unknown> | null; error?: { message: string } | null };
}): SupabaseClient {
  const tokenEqCalls: { column: string; value: string }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "connected_accounts") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: handlers.account?.data ?? null,
                  error: handlers.account?.error ?? null,
                })),
              })),
            })),
          })),
        })),
      };
    }
    if (table === "connected_account_oauth_tokens") {
      const terminal = {
        maybeSingle: vi.fn(async () => ({
          data: handlers.tokens?.data ?? null,
          error: handlers.tokens?.error ?? null,
        })),
      };
      const eqToken = vi.fn((column: string, value: string) => {
        tokenEqCalls.push({ column, value });
        if (column === "photographer_id") {
          return terminal;
        }
        return { eq: eqToken };
      });
      return {
        select: vi.fn(() => ({
          eq: eqToken,
        })),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, __tokenEqCalls: tokenEqCalls } as unknown as SupabaseClient;
}

describe("loadConnectedGoogleTokens", () => {
  it("returns tokens only when connected_account_id and photographer_id both match", async () => {
    const supabase = createSupabaseMock({
      account: {
        data: {
          id: "acc-1",
          photographer_id: "ph-1",
          email: "studio@example.com",
          token_expires_at: "2099-01-01T00:00:00.000Z",
        },
      },
      tokens: {
        data: { access_token: "at", refresh_token: "rt" },
      },
    });

    const r = await loadConnectedGoogleTokens(supabase, {
      connectedAccountId: "acc-1",
      photographerId: "ph-1",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.account.email).toBe("studio@example.com");
    expect(r.tokens.access_token).toBe("at");
    expect(r.tokens.refresh_token).toBe("rt");

    const mock = supabase as unknown as { from: ReturnType<typeof vi.fn> };
    expect(mock.from).toHaveBeenCalledWith("connected_account_oauth_tokens");
  });

  it("scopes token select with photographer_id (wrong-tenant row not returned)", async () => {
    const supabase = createSupabaseMock({
      account: {
        data: {
          id: "acc-1",
          photographer_id: "ph-1",
          email: "a@b.com",
          token_expires_at: null,
        },
      },
      tokens: { data: null },
    });

    const r = await loadConnectedGoogleTokens(supabase, {
      connectedAccountId: "acc-1",
      photographerId: "ph-1",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("oauth_tokens_not_found");
    expect(r.error).toContain("OAuth tokens");

    const calls = (supabase as unknown as { __tokenEqCalls: { column: string; value: string }[] })
      .__tokenEqCalls;
    expect(calls.some((c) => c.column === "photographer_id" && c.value === "ph-1")).toBe(true);
    expect(calls.some((c) => c.column === "connected_account_id" && c.value === "acc-1")).toBe(true);
  });

  it("returns oauth_tokens_not_found when token row is missing", async () => {
    const supabase = createSupabaseMock({
      account: {
        data: {
          id: "acc-1",
          photographer_id: "ph-1",
          email: "a@b.com",
          token_expires_at: null,
        },
      },
      tokens: { data: null },
    });

    const r = await loadConnectedGoogleTokens(supabase, {
      connectedAccountId: "acc-1",
      photographerId: "ph-1",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("oauth_tokens_not_found");
  });

  it("returns connected_account_not_found when account row is absent", async () => {
    const supabase = createSupabaseMock({
      account: { data: null },
    });

    const r = await loadConnectedGoogleTokens(supabase, {
      connectedAccountId: "acc-1",
      photographerId: "ph-1",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("connected_account_not_found");
  });

  it("rejects accountRow when id or photographer_id does not match params", async () => {
    const supabase = createSupabaseMock({});

    const r = await loadConnectedGoogleTokens(supabase, {
      connectedAccountId: "acc-1",
      photographerId: "ph-1",
      accountRow: {
        id: "other",
        photographer_id: "ph-1",
        email: "x@y.com",
        token_expires_at: null,
      },
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("connected_account_not_found");
    expect(supabase.from).not.toHaveBeenCalledWith("connected_accounts");
  });

  it("skips account select when accountRow matches and still loads tokens", async () => {
    const supabase = createSupabaseMock({
      tokens: { data: { access_token: "a", refresh_token: null } },
    });

    const r = await loadConnectedGoogleTokens(supabase, {
      connectedAccountId: "acc-1",
      photographerId: "ph-1",
      accountRow: {
        id: "acc-1",
        photographer_id: "ph-1",
        email: "z@z.com",
        token_expires_at: null,
      },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.account.email).toBe("z@z.com");
    expect(supabase.from).not.toHaveBeenCalledWith("connected_accounts");
    expect(supabase.from).toHaveBeenCalledWith("connected_account_oauth_tokens");
  });
});
