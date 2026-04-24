/**
 * V3 security slice 2 — non-text / attachment boundaries for model-facing strings.
 * Does not fetch or OCR files; prevents inline data URLs and flags structured attachments.
 *
 * P12 v1 — metadata-only attachment inventory (MIME + optional filename hints) so
 * attachment-bearing threads are less "blind" without claiming file content.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Shown when `message_attachments` rows exist for a message (Twilio/email metadata). */
export const STRUCTURED_ATTACHMENT_BANNER =
  "[Attachment(s) on this message — file content is not available to the model. Use human review or a document/compliance workflow.]";

/**
 * When filename / flags suggest financial, identity, or signed-document material.
 * Keeps the model from inventing attachment contents (stress-test / compliance-safe path).
 */
export const SENSITIVE_ATTACHMENT_CUE =
  "[Some attachments may resemble financial, identity, or signed-document material — do not assume or quote file contents; use human review before commitments.]";

const FILENAME_SENSITIVE_RE =
  /bank|receipt|statement|invoice|swift|wire|iban|passport|contract|nda|w-9|w9|tax|1099|i-9|kyc|aml|voided.?check|routing/i;

export type AttachmentRollupInputRow = {
  mime_type: string | null;
  metadata: unknown;
  kind: string;
};

export type AttachmentModelRollup = {
  /** Inventory line — MIME/classes only; never claims OCR or file text. */
  summaryLine: string;
  sensitiveCue: boolean;
};

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

function labelForAttachmentRow(r: AttachmentRollupInputRow): string {
  const mime = (r.mime_type ?? "").toLowerCase().trim();
  if (mime === "application/pdf" || mime.endsWith("/pdf")) return "PDF (document)";
  if (mime.startsWith("image/")) return "image (visual/reference)";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv" ||
    mime.includes("csv")
  ) {
    return "spreadsheet";
  }
  if (
    mime.includes("msword") ||
    mime.includes("wordprocessingml") ||
    mime.includes("opendocument.text")
  ) {
    return "document";
  }
  if (mime.includes("zip") || mime.includes("compressed")) return "archive";
  if (mime.length > 0) {
    const sub = mime.split("/")[1] ?? "unknown";
    return `file (${sub})`;
  }
  return "file (type unknown)";
}

/** Exported for tests — conservative filename / flag heuristics on JSON metadata only. */
export function metadataSuggestsSensitiveAttachment(metadata: unknown): boolean {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const o = metadata as Record<string, unknown>;
  if (o.sensitive_for_model === true || o.sensitive_attachment === true || o.compliance_candidate === true) {
    return true;
  }
  const nameRaw = o.original_filename ?? o.filename ?? o.file_name;
  if (typeof nameRaw !== "string") return false;
  const name = nameRaw.toLowerCase();
  return FILENAME_SENSITIVE_RE.test(name);
}

function rowSuggestsSensitive(r: AttachmentRollupInputRow): boolean {
  if (metadataSuggestsSensitiveAttachment(r.metadata)) return true;
  const k = (r.kind ?? "").toLowerCase();
  return k.includes("compliance") || k.includes("signed");
}

/** Build a single-message rollup from `message_attachments` rows (same tenant). */
export function buildAttachmentModelRollupFromRows(rows: AttachmentRollupInputRow[]): AttachmentModelRollup {
  if (rows.length === 0) {
    return {
      summaryLine: "structured attachment(s) — metadata not available in this read",
      sensitiveCue: true,
    };
  }
  const labels = rows.map(labelForAttachmentRow);
  const counts = new Map<string, number>();
  for (const l of labels) {
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([l, n]) => (n > 1 ? `${n}× ${l}` : `1× ${l}`));
  const summaryLine = parts.join("; ");
  const sensitiveCue = rows.some(rowSuggestsSensitive);
  return { summaryLine, sensitiveCue };
}

export type AttachmentRedactionOptions = {
  /** True when `message_attachments` has at least one row for this message. */
  hasStructuredAttachments: boolean;
  /** P12 v1 — optional MIME/filename-metadata inventory (no file content). */
  attachmentRollup?: AttachmentModelRollup | null;
};

function structuredAttachmentPreamble(options: AttachmentRedactionOptions): string {
  const parts: string[] = [STRUCTURED_ATTACHMENT_BANNER];
  const rollup = options.attachmentRollup;
  if (rollup?.summaryLine) {
    parts.push(
      `Attachment inventory (metadata only — the model cannot open or OCR files): ${rollup.summaryLine}`,
    );
  }
  if (rollup?.sensitiveCue) {
    parts.push(SENSITIVE_ATTACHMENT_CUE);
  }
  return parts.join("\n");
}

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
    const preamble = structuredAttachmentPreamble(options);
    if (!t) {
      return preamble;
    }
    return `${preamble}\n\n${t}`;
  }

  return t;
}

export type AttachmentContextBatch = {
  messagesWithAttachments: Set<string>;
  rollups: Map<string, AttachmentModelRollup>;
};

/**
 * Single round-trip: which messages have structured attachments + per-message metadata rollups.
 */
export async function fetchAttachmentContextBatch(
  supabase: SupabaseClient,
  photographerId: string,
  messageIds: string[],
): Promise<AttachmentContextBatch> {
  const unique = [...new Set(messageIds.filter((id) => id.length > 0))];
  if (unique.length === 0) {
    return { messagesWithAttachments: new Set(), rollups: new Map() };
  }

  const { data, error } = await supabase
    .from("message_attachments")
    .select("message_id, mime_type, metadata, kind")
    .eq("photographer_id", photographerId)
    .in("message_id", unique);

  if (error) {
    throw new Error(`fetchAttachmentContextBatch: ${error.message}`);
  }

  const byMsg = new Map<string, AttachmentRollupInputRow[]>();
  for (const r of data ?? []) {
    const mid = r.message_id as string;
    if (!mid) continue;
    const row: AttachmentRollupInputRow = {
      mime_type: (r.mime_type as string | null) ?? null,
      metadata: r.metadata ?? null,
      kind: String((r as { kind?: string }).kind ?? ""),
    };
    const arr = byMsg.get(mid) ?? [];
    arr.push(row);
    byMsg.set(mid, arr);
  }

  const messagesWithAttachments = new Set(byMsg.keys());
  const rollups = new Map<string, AttachmentModelRollup>();
  for (const [mid, rows] of byMsg) {
    rollups.set(mid, buildAttachmentModelRollupFromRows(rows));
  }
  return { messagesWithAttachments, rollups };
}

/** Returns message ids that have at least one `message_attachments` row (tenant-scoped). */
export async function fetchMessageIdsWithStructuredAttachments(
  supabase: SupabaseClient,
  photographerId: string,
  messageIds: string[],
): Promise<Set<string>> {
  const { messagesWithAttachments } = await fetchAttachmentContextBatch(supabase, photographerId, messageIds);
  return messagesWithAttachments;
}
