/**
 * Proof: first attachment only is ingested (narrow slice). Multiple Twilio media on one message:
 * only index 0 is passed to upload; additional indices are not processed here.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { COMPLIANCE_ASSET_LIBRARY_BUCKET, getCanonicalComplianceAssetObjectPath } from "./resolveComplianceAssetStorage.ts";
import {
  tryIngestFirstComplianceAttachmentFromOperatorWhatsApp,
} from "./complianceAssetWhatsAppIngest.ts";
import { V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY } from "./complianceWhatsAppPendingCollect.ts";

const PH = "22222222-2222-4222-8222-222222222222";

describe("tryIngestFirstComplianceAttachmentFromOperatorWhatsApp", () => {
  it("uploads only the first attachment path when two URLs are present", async () => {
    const uploaded: { bucket: string; path: string }[] = [];
    const fetchMedia = vi.fn(async (url: string) => {
      if (url === "https://api.twilio.com/first") {
        return { ok: true as const, body: new Uint8Array([1, 2, 3]).buffer, contentType: "application/pdf" };
      }
      throw new Error("second URL must not be fetched in first-only ingest");
    });

    const sb = {
      from: (table: string) => {
        if (table === "photographers") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    settings: {
                      [V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY]: {
                        library_key: "public_liability_coi",
                        set_at: "2026-01-01T00:00:00.000Z",
                        source_thread_id: "thread-a",
                        wedding_id: "wed-a",
                      },
                    },
                  },
                  error: null,
                }),
              }),
            }),
            update: (_payload: unknown) => ({ eq: () => ({ error: null }) }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      storage: {
        from: (bucket: string) => ({
          upload: vi.fn(async (objectPath: string, _body: Blob, _opts: unknown) => {
            uploaded.push({ bucket, path: objectPath });
            return { error: null };
          }),
        }),
      },
    } as unknown as SupabaseClient;

    const result = await tryIngestFirstComplianceAttachmentFromOperatorWhatsApp(
      sb,
      PH,
      [
        { index: "0", url: "https://api.twilio.com/first", contentType: "application/pdf" },
        { index: "1", url: "https://api.twilio.com/second", contentType: "image/jpeg" },
      ],
      { fetchMedia },
    );

    expect(result).toEqual({ status: "ingested", library_key: "public_liability_coi" });
    expect(fetchMedia).toHaveBeenCalledTimes(1);
    expect(fetchMedia).toHaveBeenCalledWith("https://api.twilio.com/first");
    expect(uploaded).toEqual([
      {
        bucket: COMPLIANCE_ASSET_LIBRARY_BUCKET,
        path: getCanonicalComplianceAssetObjectPath(PH, "public_liability_coi"),
      },
    ]);
  });

  it("skips when no pending collect in settings", async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { settings: {} },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const r = await tryIngestFirstComplianceAttachmentFromOperatorWhatsApp(sb, PH, [
      { index: "0", url: "https://x", contentType: "application/pdf" },
    ], {
      fetchMedia: async () => ({ ok: true, body: new ArrayBuffer(0), contentType: null }),
    });
    expect(r).toEqual({ status: "skipped", reason: "no_pending_compliance_collect" });
  });
});
