/**
 * V3 security slice 2 — non-text / attachment boundaries for model-facing strings.
 * Does not fetch or OCR files; prevents inline data URLs and flags structured attachments.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Shown when `message_attachments` rows exist for a message (Twilio/email metadata). */
export const STRUCTURED_ATTACHMENT_BANNER =
  "[Attachment(s) on this message — file content is not available to the model. Use human review or a document/compliance workflow.]";

/**
 * Strip `data:*;base64,...` URLs (screenshots pasted inline, PDFs, etc.) from text before prompts.
 */
export function stripInlineDataUrlsFromText(raw: string): string {
  if (!raw) return "";
  // Broad data-URL pattern (RFC 2397); avoids feeding base64 blobs into LLM context.
  return raw.replace(
    /data:[a-zA-Z]+\/[a-zA-Z0-9.+\-]+;base64,[A-Za-z0-9+/=\r\n]+/g,
    "[inline data URL omitted]",
  );
}

export type AttachmentRedactionOptions = {
  /** True when `message_attachments` has at least one row for this message. */
  hasStructuredAttachments: boolean;
};

/**
 * Combine structured-attachment policy + data-URL stripping for one message body.
 * Call after DB fetch; never pass `raw_payload` through here.
 */
export function redactMessageBodyForModelContext(
  body: string,
  options: AttachmentRedactionOptions,
): string {
  let t = stripInlineDataUrlsFromText(body);
  t = t.trim();

  if (options.hasStructuredAttachments) {
    if (!t) {
      return STRUCTURED_ATTACHMENT_BANNER;
    }
    return `${STRUCTURED_ATTACHMENT_BANNER}\n\n${t}`;
  }

  return t;
}

/** Returns message ids that have at least one `message_attachments` row (tenant-scoped). */
export async function fetchMessageIdsWithStructuredAttachments(
  supabase: SupabaseClient,
  photographerId: string,
  messageIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(messageIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return new Set();

  const { data, error } = await supabase
    .from("message_attachments")
    .select("message_id")
    .eq("photographer_id", photographerId)
    .in("message_id", unique);

  if (error) {
    throw new Error(`fetchMessageIdsWithStructuredAttachments: ${error.message}`);
  }

  const out = new Set<string>();
  for (const r of data ?? []) {
    const id = r.message_id as string;
    if (id) out.add(id);
  }
  return out;
}
