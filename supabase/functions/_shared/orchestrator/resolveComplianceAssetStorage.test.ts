import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import {
  COMPLIANCE_ASSET_LIBRARY_BUCKET,
  buildComplianceAssetAttachmentDescriptor,
  createComplianceAssetSignedUrlForOperator,
  enrichProposalsWithComplianceAssetResolution,
  getCanonicalComplianceAssetObjectPath,
  getComplianceAssetStorageTarget,
  resolveComplianceAssetStorage,
  uploadComplianceAssetToLibrary,
} from "./resolveComplianceAssetStorage.ts";

const PH = "11111111-1111-4111-8111-111111111111";

function mockSupabase(opts: {
  settings?: unknown;
  downloadResult: "ok" | "not_found" | "error";
  signedUrl?: string | null;
}): SupabaseClient {
  const download = vi.fn(async (_path: string) => {
    if (opts.downloadResult === "ok") return { data: new Blob([1, 2]), error: null };
    if (opts.downloadResult === "not_found") {
      return { data: null, error: { message: "Object not found", statusCode: "404" } };
    }
    return { data: null, error: { message: "network", statusCode: "500" } };
  });
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: opts.signedUrl ?? "https://signed.example/x" },
    error: null,
  }));
  return {
    from: (table: string) => {
      if (table !== "photographers") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { settings: opts.settings ?? {} },
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
}

describe("resolveComplianceAssetStorage", () => {
  it("getCanonicalComplianceAssetObjectPath matches default filenames", () => {
    expect(getCanonicalComplianceAssetObjectPath(PH, "public_liability_coi")).toBe(
      `${PH}/public_liability_coi.pdf`,
    );
    expect(getCanonicalComplianceAssetObjectPath(PH, "venue_security_compliance_packet")).toBe(
      `${PH}/venue_security_compliance_packet.pdf`,
    );
  });

  it("resolveComplianceAssetStorage sets found true on exact-path download success", async () => {
    const sb = mockSupabase({ downloadResult: "ok" });
    const r = await resolveComplianceAssetStorage(sb, PH, "public_liability_coi");
    expect(r.library_key).toBe("public_liability_coi");
    expect(r.storage_bucket).toBe(COMPLIANCE_ASSET_LIBRARY_BUCKET);
    expect(r.object_path).toBe(`${PH}/public_liability_coi.pdf`);
    expect(r.found).toBe(true);
  });

  it("resolveComplianceAssetStorage sets found false on 404-style download error", async () => {
    const sb = mockSupabase({ downloadResult: "not_found" });
    const r = await resolveComplianceAssetStorage(sb, PH, "public_liability_coi");
    expect(r.found).toBe(false);
  });

  it("uses v3_compliance_asset_overrides from settings when present", async () => {
    const sb = mockSupabase({
      settings: {
        v3_compliance_asset_overrides: {
          public_liability_coi: { bucket: "custom_b", path: "x/y/z.pdf" },
        },
      },
      downloadResult: "ok",
    });
    const r = await resolveComplianceAssetStorage(sb, PH, "public_liability_coi");
    expect(r.storage_bucket).toBe("custom_b");
    expect(r.object_path).toBe("x/y/z.pdf");
    expect(r.found).toBe(true);
  });

  it("enrichProposalsWithComplianceAssetResolution attaches resolution without signed URLs", async () => {
    const sb = mockSupabase({ downloadResult: "ok" });
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "a",
        action_family: "operator_notification_routing",
        action_key: "v3_compliance_asset_library_attach",
        rationale: "r",
        verifier_gating_required: true,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
        compliance_asset_library_key: "public_liability_coi",
      },
    ];
    const out = await enrichProposalsWithComplianceAssetResolution(sb, PH, proposals);
    expect(out[0]?.compliance_asset_resolution?.found).toBe(true);
    expect(out[0]?.compliance_asset_resolution).not.toHaveProperty("signed_url");
  });

  it("enrichProposals memoizes one download per library key", async () => {
    const download = vi.fn(async (_path: string) => ({ data: new Blob([1]), error: null }));
    const sb = {
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
        from: (_bucket: string) => ({ download }),
      },
    } as unknown as SupabaseClient;
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "op",
        action_family: "operator_notification_routing",
        action_key: "v3_compliance_asset_library_attach",
        rationale: "r",
        verifier_gating_required: true,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
        compliance_asset_library_key: "public_liability_coi",
      },
      {
        id: "sm",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "r2",
        verifier_gating_required: true,
        likely_outcome: "block",
        blockers_or_missing_facts: [],
        compliance_asset_library_key: "public_liability_coi",
      },
    ];
    const out = await enrichProposalsWithComplianceAssetResolution(sb, PH, proposals);
    expect(out[0]?.compliance_asset_resolution?.object_path).toBe(out[1]?.compliance_asset_resolution?.object_path);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("buildComplianceAssetAttachmentDescriptor derives filename and pdf mime", () => {
    const d = buildComplianceAssetAttachmentDescriptor({
      library_key: "public_liability_coi",
      storage_bucket: "b",
      object_path: "u/f/foo.pdf",
      found: true,
    });
    expect(d.filename).toBe("foo.pdf");
    expect(d.mimeGuess).toBe("application/pdf");
  });

  it("createComplianceAssetSignedUrlForOperator returns signed URL (not on proposals)", async () => {
    const sb = mockSupabase({ downloadResult: "ok", signedUrl: "https://example/s" });
    const r = await createComplianceAssetSignedUrlForOperator(sb, {
      bucket: "b",
      object_path: "p",
    });
    expect(r.signedUrl).toBe("https://example/s");
    expect(r.error).toBeNull();
  });

  it("getComplianceAssetStorageTarget matches canonical path without download", async () => {
    const sb = mockSupabase({ downloadResult: "ok" });
    const t = await getComplianceAssetStorageTarget(sb, PH, "public_liability_coi");
    expect(t.storage_bucket).toBe(COMPLIANCE_ASSET_LIBRARY_BUCKET);
    expect(t.object_path).toBe(`${PH}/public_liability_coi.pdf`);
  });

  it("uploadComplianceAssetToLibrary uploads to resolved path", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const sb = {
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
        from: (_bucket: string) => ({ upload }),
      },
    } as unknown as SupabaseClient;
    const buf = new ArrayBuffer(4);
    const r = await uploadComplianceAssetToLibrary(sb, PH, "public_liability_coi", buf);
    expect(r).toEqual({ ok: true });
    expect(upload).toHaveBeenCalledWith(
      `${PH}/public_liability_coi.pdf`,
      expect.any(Blob),
      expect.objectContaining({ upsert: true, contentType: "application/pdf" }),
    );
  });

  it("uploadComplianceAssetToLibrary returns error when upload fails", async () => {
    const upload = vi.fn(async () => ({ error: { message: "denied" } }));
    const sb = {
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
        from: (_bucket: string) => ({ upload }),
      },
    } as unknown as SupabaseClient;
    const r = await uploadComplianceAssetToLibrary(sb, PH, "venue_security_compliance_packet", new ArrayBuffer(0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("denied");
  });
});
