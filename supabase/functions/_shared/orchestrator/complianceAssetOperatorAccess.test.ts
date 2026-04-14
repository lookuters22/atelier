/**
 * Operator download handoff tests. Limitations: no end-to-end Edge handler test here; signed URLs are
 * ephemeral and must not be merged into orchestrator proposal payloads (see decisionContext.types).
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  parseOrchestratorComplianceAssetLibraryKey,
  prepareComplianceAssetOperatorDownload,
} from "./complianceAssetOperatorAccess.ts";
import { DEFAULT_COMPLIANCE_ASSET_SIGNED_URL_TTL_SECONDS } from "./resolveComplianceAssetStorage.ts";

const PH = "33333333-3333-4333-8333-333333333333";

function mockSupabaseForResolveAndSign(opts: {
  found: boolean;
  signedUrl?: string | null;
}): { client: SupabaseClient; createSignedUrl: ReturnType<typeof vi.fn> } {
  const download = vi.fn(async () => {
    if (opts.found) return { data: new Blob([1, 2]), error: null };
    return { data: null, error: { message: "Object not found", statusCode: "404" } };
  });
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: opts.signedUrl ?? "https://signed.example/asset" },
    error: null,
  }));
  const client = {
    from: (table: string) => {
      if (table !== "photographers") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { settings: {} },
              error: null,
            }),
          }),
        }),
      };
    },
    storage: {
      from: (_bucket: string) => ({
        download,
        createSignedUrl,
      }),
    },
  } as unknown as SupabaseClient;
  return { client, createSignedUrl };
}

describe("complianceAssetOperatorAccess", () => {
  it("parseOrchestratorComplianceAssetLibraryKey accepts known keys only", () => {
    expect(parseOrchestratorComplianceAssetLibraryKey("public_liability_coi")).toBe("public_liability_coi");
    expect(parseOrchestratorComplianceAssetLibraryKey("venue_security_compliance_packet")).toBe(
      "venue_security_compliance_packet",
    );
    expect(parseOrchestratorComplianceAssetLibraryKey("other")).toBeNull();
    expect(parseOrchestratorComplianceAssetLibraryKey(null)).toBeNull();
  });

  it("prepareComplianceAssetOperatorDownload returns not_found when object missing", async () => {
    const { client, createSignedUrl } = mockSupabaseForResolveAndSign({ found: false });
    const r = await prepareComplianceAssetOperatorDownload(client, PH, "public_liability_coi");
    expect(r).toEqual({ ok: false, reason: "not_found" });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("prepareComplianceAssetOperatorDownload returns metadata and signed URL when found", async () => {
    const { client } = mockSupabaseForResolveAndSign({ found: true, signedUrl: "https://x.test/signed" });
    const r = await prepareComplianceAssetOperatorDownload(client, PH, "public_liability_coi");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.signed_url).toBe("https://x.test/signed");
    expect(r.filename).toBe("public_liability_coi.pdf");
    expect(r.mime_guess).toBe("application/pdf");
    expect(r.library_key).toBe("public_liability_coi");
    expect(r.expires_in_seconds).toBe(DEFAULT_COMPLIANCE_ASSET_SIGNED_URL_TTL_SECONDS);
    expect(r.expires_at.length).toBeGreaterThan(10);
    expect(r.object_path).toContain(PH);
  });
});
