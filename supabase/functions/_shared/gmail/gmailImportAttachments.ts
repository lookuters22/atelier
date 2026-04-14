/**
 * Fetch Gmail attachment bytes, upload to tenant Storage, insert `message_attachments` rows.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64UrlToBytes } from "./gmailBase64.ts";
import { fetchGmailAttachmentBytes } from "./gmailAttachmentFetch.ts";
import type { GmailAttachmentCandidate } from "./gmailMimeAttachments.ts";

export const GMAIL_IMPORT_MEDIA_BUCKET = "message_attachment_media" as const;

/** Same cap as `gmailMimeAttachments` / staging — exposed for tests and prefetch checks. */
export const GMAIL_IMPORT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const MAX_BYTES = GMAIL_IMPORT_MAX_ATTACHMENT_BYTES;

/**
 * When Gmail already reported `body.size` / computed size on the candidate, skip `attachments.get`
 * (or skip base64 decode for inline parts) before pulling full bytes into memory.
 * Conservative: if size is missing, zero, or NaN, we still fetch/decode and enforce the cap afterward.
 */
export function shouldSkipImportByDeclaredOversizedSize(c: GmailAttachmentCandidate): boolean {
  const sz = c.sizeBytes;
  if (typeof sz !== "number" || !Number.isFinite(sz) || sz <= 0) return false;
  return sz > MAX_BYTES;
}

function sanitizeFilenameSegment(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "file";
  return base.slice(0, 180);
}

/** Stable per Gmail message + part/attachment — matches `message_attachments.source_url` for idempotent skips. */
export function buildGmailImportLiveSourceUrl(
  gmailMessageId: string,
  c: GmailAttachmentCandidate,
): string {
  if (c.attachmentId) {
    return `gmail-import:${gmailMessageId}:${c.attachmentId}`;
  }
  const stable =
    c.partId && c.partId.length > 0
      ? c.partId
      : `inline-${c.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48)}-${c.sizeBytes}`;
  return `gmail-import:${gmailMessageId}:part:${stable}`;
}

function buildObjectPath(
  photographerId: string,
  messageId: string,
  c: GmailAttachmentCandidate,
  filename: string,
): string {
  const safe = sanitizeFilenameSegment(filename);
  const shortKey = (c.attachmentId ?? c.partId ?? "inline").slice(0, 24).replace(/[^a-zA-Z0-9_-]/g, "");
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${photographerId}/${messageId}/${shortKey}-${suffix}-${safe}`;
}

export type GmailImportAttachmentsResult = {
  imported: number;
  failed: number;
  /** Total candidates skipped for exceeding max size (prefetch + post-bytes check). */
  skipped_oversized: number;
  /** Subset: declared `sizeBytes` exceeded max before `attachments.get` / inline decode. */
  skipped_oversized_prefetch: number;
  /** Candidates skipped because `message_attachments` already has this `source_url` (retry / partial rerun). */
  skipped_already_present: number;
};

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  return err?.code === "23505" || Boolean(err?.message?.includes("duplicate"));
}

export async function importGmailAttachmentsForMessage(
  supabase: SupabaseClient,
  opts: {
    accessToken: string;
    gmailMessageId: string;
    photographerId: string;
    messageId: string;
    candidates: GmailAttachmentCandidate[];
  },
): Promise<GmailImportAttachmentsResult> {
  const { accessToken, gmailMessageId, photographerId, messageId, candidates } = opts;
  let imported = 0;
  let failed = 0;
  let skipped_oversized = 0;
  let skipped_oversized_prefetch = 0;
  let skipped_already_present = 0;

  const { data: existingRows, error: selErr } = await supabase
    .from("message_attachments")
    .select("source_url")
    .eq("message_id", messageId)
    .eq("photographer_id", photographerId);

  if (selErr) {
    console.warn("[gmailImportAttachments] existing_source_urls", selErr.message);
  }

  const existingSourceUrls = new Set<string>();
  for (const row of existingRows ?? []) {
    const u = row.source_url;
    if (typeof u === "string" && u.length > 0) existingSourceUrls.add(u);
  }

  for (const c of candidates) {
    const source_url = buildGmailImportLiveSourceUrl(gmailMessageId, c);
    if (existingSourceUrls.has(source_url)) {
      skipped_already_present += 1;
      continue;
    }
    if (shouldSkipImportByDeclaredOversizedSize(c)) {
      skipped_oversized_prefetch += 1;
      skipped_oversized += 1;
      continue;
    }
    try {
      let bytes: Uint8Array;
      if (c.inlineDataBase64Url) {
        bytes = decodeBase64UrlToBytes(c.inlineDataBase64Url);
      } else if (c.attachmentId) {
        bytes = await fetchGmailAttachmentBytes(accessToken, gmailMessageId, c.attachmentId);
      } else {
        failed += 1;
        continue;
      }

      if (bytes.byteLength > MAX_BYTES) {
        skipped_oversized += 1;
        continue;
      }
      const objectPath = buildObjectPath(photographerId, messageId, c, c.filename);
      const blob = new Blob([bytes], { type: c.mimeType || "application/octet-stream" });
      const { error: upErr } = await supabase.storage
        .from(GMAIL_IMPORT_MEDIA_BUCKET)
        .upload(objectPath, blob, {
          upsert: false,
          contentType: c.mimeType || "application/octet-stream",
        });
      if (upErr) {
        console.warn("[gmailImportAttachments] upload", upErr.message);
        failed += 1;
        continue;
      }

      const { error: insErr } = await supabase.from("message_attachments").insert({
        message_id: messageId,
        photographer_id: photographerId,
        kind: "attachment",
        source_url,
        storage_path: objectPath,
        mime_type: c.mimeType,
        metadata: {
          source: "gmail_import",
          storage_bucket: GMAIL_IMPORT_MEDIA_BUCKET,
          gmail_message_id: gmailMessageId,
          gmail_attachment_id: c.attachmentId,
          gmail_part_id: c.partId,
          gmail_size_bytes: c.sizeBytes,
          content_id: c.contentId,
          original_filename: c.filename,
          disposition: c.disposition,
          bytes_source: c.inlineDataBase64Url ? "body_data" : "attachments_api",
        },
      });

      if (insErr) {
        if (isUniqueViolation(insErr)) {
          await supabase.storage.from(GMAIL_IMPORT_MEDIA_BUCKET).remove([objectPath]).catch(() => {});
          skipped_already_present += 1;
          existingSourceUrls.add(source_url);
        } else {
          console.warn("[gmailImportAttachments] insert", insErr.message);
          failed += 1;
          await supabase.storage.from(GMAIL_IMPORT_MEDIA_BUCKET).remove([objectPath]).catch(() => {});
        }
        continue;
      }
      imported += 1;
      existingSourceUrls.add(source_url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[gmailImportAttachments] fetch", msg.slice(0, 200));
      failed += 1;
    }
  }

  return { imported, failed, skipped_oversized, skipped_oversized_prefetch, skipped_already_present };
}
