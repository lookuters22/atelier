/**
 * Operator WhatsApp → compliance asset library (narrow slice).
 *
 * **Only the first Twilio media attachment** on the inbound message is eligible for automatic ingestion.
 * Additional attachments are intentionally ignored here — do not assume multi-file ingest without extending this module.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchTwilioMediaUrlAsArrayBuffer } from "../twilio.ts";
import { uploadComplianceAssetToLibrary } from "./resolveComplianceAssetStorage.ts";
import {
  clearComplianceWhatsAppPendingCollect,
  parseComplianceWhatsAppPendingCollect,
} from "./complianceWhatsAppPendingCollect.ts";

export type TwilioInboundAttachmentMeta = {
  index: string;
  url: string | undefined;
  contentType: string | undefined;
};

export type MediaFetchFn = (
  mediaUrl: string,
) => Promise<
  { ok: true; body: ArrayBuffer; contentType: string | null } | { ok: false; error: string }
>;

/**
 * If pending collect is set and the message includes media, download **only `attachments[0]`** and
 * upload to the canonical compliance library path for `library_key`.
 */
export async function tryIngestFirstComplianceAttachmentFromOperatorWhatsApp(
  supabase: SupabaseClient,
  photographerId: string,
  attachments: TwilioInboundAttachmentMeta[],
  deps?: { fetchMedia?: MediaFetchFn },
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "ingested"; library_key: string }
  | { status: "failed"; reason: string }
> {
  const fetchMedia = deps?.fetchMedia ?? fetchTwilioMediaUrlAsArrayBuffer;

  if (attachments.length === 0) {
    return { status: "skipped", reason: "no_attachments" };
  }

  /**
   * Explicit narrow scope: single-attachment ingest only (first index).
   * @see TwilioInboundAttachmentMeta — callers may pass multiple; we deliberately take `[0]` only.
   */
  const firstAttachment = attachments[0]!;
  const mediaUrl = firstAttachment.url?.trim();
  if (!mediaUrl) {
    return { status: "skipped", reason: "first_attachment_missing_url" };
  }

  const { data: row, error: selErr } = await supabase
    .from("photographers")
    .select("settings")
    .eq("id", photographerId)
    .maybeSingle();
  if (selErr) {
    return { status: "failed", reason: `settings_read:${selErr.message}` };
  }
  const pending = parseComplianceWhatsAppPendingCollect((row as { settings?: unknown } | null)?.settings);
  if (!pending) {
    return { status: "skipped", reason: "no_pending_compliance_collect" };
  }

  const downloaded = await fetchMedia(mediaUrl);
  if (!downloaded.ok) {
    return { status: "failed", reason: `download:${downloaded.error}` };
  }

  const contentType =
    firstAttachment.contentType?.trim() ||
    downloaded.contentType ||
    undefined;

  const up = await uploadComplianceAssetToLibrary(supabase, photographerId, pending.library_key, downloaded.body, {
    contentType,
    upsert: true,
  });
  if (!up.ok) {
    return { status: "failed", reason: `upload:${up.error}` };
  }

  await clearComplianceWhatsAppPendingCollect(supabase, photographerId);
  return { status: "ingested", library_key: pending.library_key };
}
