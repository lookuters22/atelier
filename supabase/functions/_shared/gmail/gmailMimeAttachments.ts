/**
 * Walk Gmail MIME payloads for attachment parts; filter inline CID images vs user-facing files.
 *
 * Gmail may return attachment bytes either as `body.attachmentId` (fetch via attachments.get)
 * or inlined as base64url in `body.data` when the part is small — we must handle both.
 */
import type { GmailPayloadPart } from "./gmailMessageBody.ts";
import { decodeBase64UrlUtf8 } from "./gmailMessageBody.ts";
import { decodeBase64UrlToBytes } from "./gmailBase64.ts";

export type GmailAttachmentDisposition = "inline" | "attachment" | "unknown";

export type GmailAttachmentCandidate = {
  /**
   * Present when Gmail requires `users.messages.attachments.get`.
   * Omitted when bytes are in `inlineDataBase64Url`.
   */
  attachmentId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentId: string | null;
  disposition: GmailAttachmentDisposition;
  /** Gmail `partId` for stable dedupe / source_url when not using attachmentId. */
  partId: string | null;
  /** Raw `body.data` (base64url) when Gmail inlined the file and did not set attachmentId. */
  inlineDataBase64Url?: string;
};

export const GMAIL_MAX_ATTACHMENTS_PER_MESSAGE = 50;
const MAX_ATTACHMENTS_PER_MESSAGE = GMAIL_MAX_ATTACHMENTS_PER_MESSAGE;
const MAX_BYTES_PER_ATTACHMENT = 25 * 1024 * 1024;
/** Skip tiny inline images (logos / tracking pixels) when CID-linked in HTML. */
const SMALL_INLINE_IMAGE_BYTES = 30_000;

function headerMap(headers: { name?: string; value?: string }[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const h of headers) {
    if (h.name && h.value) out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

function parseFilenameFromContentDisposition(cd: string): string | null {
  const v = cd.trim();
  const star = /filename\*=UTF-8''([^;\s]+)|filename\*=([^;\s]+)/i.exec(v);
  if (star?.[1]) return decodeURIComponent(star[1]);
  if (star?.[2]) return decodeURIComponent(star[2]);
  const fn = /filename\s*=\s*("?)([^";\r\n]+)\1/i.exec(v);
  if (fn?.[2]) return fn[2].trim();
  return null;
}

function parseNameFromContentType(ct: string): string | null {
  const m = /name\s*=\s*("?)([^";\r\n]+)\1/i.exec(ct);
  return m?.[2]?.trim() ?? null;
}

function parseContentDisposition(
  raw: string | undefined,
): { kind: GmailAttachmentDisposition; filename: string | null } {
  if (!raw) return { kind: "unknown", filename: null };
  const lower = raw.toLowerCase();
  const kind: GmailAttachmentDisposition = lower.includes("attachment")
    ? "attachment"
    : lower.includes("inline")
      ? "inline"
      : "unknown";
  return { kind, filename: parseFilenameFromContentDisposition(raw) };
}

function parseContentId(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/^<|>$/g, "").trim() || null;
}

/** Normalize for comparison with `cid:` references in HTML. */
export function normalizeContentIdForMatch(cid: string): string {
  return cid.replace(/^<|>$/g, "").trim().toLowerCase();
}

/** Collect `cid:...` token values from HTML (case-insensitive). */
export function extractCidReferencesFromHtml(html: string | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!html) return set;
  const re = /\bcid:([^'")\s>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const token = m[1]?.trim();
    if (token) set.add(normalizeContentIdForMatch(token));
  }
  return set;
}

function isMultipartMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("multipart/");
}

function buildFilename(part: GmailPayloadPart, headers: Record<string, string>): string {
  if (typeof part.filename === "string" && part.filename.trim().length > 0) {
    return part.filename.trim();
  }
  const cd = headers["content-disposition"];
  const fnFromCd = cd ? parseFilenameFromContentDisposition(cd) : null;
  if (fnFromCd) return fnFromCd;
  const ct = headers["content-type"] ?? part.mimeType ?? "";
  const fnFromCt = parseNameFromContentType(ct);
  if (fnFromCt) return fnFromCt;
  return "attachment";
}

/**
 * Whether this part should become a user-visible attachment row (vs hidden inline HTML asset).
 */
export function shouldExposeGmailAttachment(
  c: GmailAttachmentCandidate,
  html: string | null | undefined,
): boolean {
  const mime = c.mimeType.toLowerCase();
  if (mime === "text/plain" || mime === "text/html") return false;
  if (c.sizeBytes > MAX_BYTES_PER_ATTACHMENT) return false;

  const cidRefs = extractCidReferencesFromHtml(html);
  const cidNorm = c.contentId ? normalizeContentIdForMatch(c.contentId) : null;

  if (c.disposition === "attachment") return true;

  if (mime.startsWith("image/")) {
    if (cidNorm && cidRefs.has(cidNorm)) return false;
    if (c.disposition === "inline" && c.sizeBytes <= SMALL_INLINE_IMAGE_BYTES) return false;
  }

  if (c.disposition === "inline" && !mime.startsWith("image/")) {
    return true;
  }

  if (c.disposition === "unknown" && !mime.startsWith("image/")) {
    return true;
  }

  /** Many senders omit Content-Disposition or use non-standard values; still show non-CID images. */
  if (c.disposition === "unknown" && mime.startsWith("image/")) {
    if (cidNorm && cidRefs.has(cidNorm)) return false;
    return true;
  }

  if (c.disposition === "inline" && mime.startsWith("image/") && c.sizeBytes > SMALL_INLINE_IMAGE_BYTES) {
    return true;
  }

  return false;
}

function partToCandidate(part: GmailPayloadPart): GmailAttachmentCandidate | null {
  const aid = part.body?.attachmentId;
  const data = part.body?.data;
  const hasAid = typeof aid === "string" && aid.length > 0;
  const hasData = typeof data === "string" && data.length > 0;

  if (!hasAid && !hasData) return null;

  const headers = headerMap(part.headers);
  const cdRaw = headers["content-disposition"];
  const { kind: disposition, filename: fnFromDisp } = parseContentDisposition(cdRaw);
  const rawMime = (part.mimeType ?? headers["content-type"] ?? "application/octet-stream").split(";")[0]
    .trim();
  const mimeType = rawMime || "application/octet-stream";

  if (isMultipartMime(mimeType)) return null;
  if (mimeType === "text/plain" || mimeType === "text/html") return null;

  const filename = fnFromDisp ?? buildFilename(part, headers);
  let sizeBytes = typeof part.body?.size === "number" ? part.body.size : 0;
  if (hasData && sizeBytes <= 0) {
    try {
      sizeBytes = decodeBase64UrlToBytes(data!).byteLength;
    } catch {
      sizeBytes = 0;
    }
  }

  const contentIdRaw = headers["content-id"];
  const contentId = contentIdRaw ? parseContentId(contentIdRaw) : null;
  const partId = typeof part.partId === "string" && part.partId.length > 0 ? part.partId : null;

  if (hasAid) {
    return {
      attachmentId: aid!,
      filename,
      mimeType,
      sizeBytes,
      contentId,
      disposition,
      partId,
    };
  }

  /** Inlined small attachment bytes (no attachmentId). */
  return {
    attachmentId: null,
    filename,
    mimeType,
    sizeBytes,
    contentId,
    disposition,
    partId,
    inlineDataBase64Url: data!,
  };
}

/**
 * Single recursive MIME walk: longest text/plain + text/html (same rules as
 * `extractPlainAndHtmlFromPayload`) plus raw attachment candidates (same as `partToCandidate` leaves).
 * Used by materialization to avoid traversing the latest message payload twice.
 */
export function walkGmailPayloadForMaterialization(payload: GmailPayloadPart | undefined): {
  plain: string | null;
  html: string | null;
  raw: GmailAttachmentCandidate[];
  stats: GmailAttachmentPipelineStats;
} {
  const plains: string[] = [];
  const htmls: string[] = [];
  const raw: GmailAttachmentCandidate[] = [];

  function visit(part: GmailPayloadPart | undefined): void {
    if (!part) return;
    if (part.parts && part.parts.length > 0) {
      for (const p of part.parts) visit(p);
      return;
    }
    const mt = (part.mimeType ?? "").toLowerCase();
    if (mt === "text/plain" && part.body?.data) {
      try {
        plains.push(decodeBase64UrlUtf8(part.body.data));
      } catch {
        /* skip */
      }
      return;
    }
    if (mt === "text/html" && part.body?.data) {
      try {
        htmls.push(decodeBase64UrlUtf8(part.body.data));
      } catch {
        /* skip */
      }
      return;
    }
    const c = partToCandidate(part);
    if (c) raw.push(c);
  }

  visit(payload);

  const pickLongest = (xs: string[]): string | null =>
    xs.length === 0 ? null : xs.reduce((a, b) => (a.length >= b.length ? a : b));

  const plain = pickLongest(plains);
  const html = pickLongest(htmls);

  let raw_leaf_with_attachment_id = 0;
  let raw_leaf_with_inline_data_only = 0;
  for (const c of raw) {
    if (c.attachmentId) raw_leaf_with_attachment_id += 1;
    else if (c.inlineDataBase64Url) raw_leaf_with_inline_data_only += 1;
  }

  const stats: GmailAttachmentPipelineStats = {
    raw_leaf_with_attachment_id,
    raw_leaf_with_inline_data_only,
    raw_candidates: raw.length,
    after_filter: 0,
  };

  return { plain, html, raw, stats };
}

/**
 * List MIME parts that can be imported (attachmentId fetch or inline body.data).
 */
export function listGmailAttachmentParts(payload: GmailPayloadPart | undefined): GmailAttachmentCandidate[] {
  return walkGmailPayloadForMaterialization(payload).raw;
}

export type GmailAttachmentPipelineStats = {
  /** Leaf parts with body.attachmentId (before filter). */
  raw_leaf_with_attachment_id: number;
  /** Leaf parts with body.data only (no attachmentId), non-text (before filter). */
  raw_leaf_with_inline_data_only: number;
  /** Total raw candidates built (before filter). */
  raw_candidates: number;
  /** After shouldExposeGmailAttachment. */
  after_filter: number;
};

/**
 * Counts for observability (single-message debugging).
 */
export function measureGmailAttachmentPayload(payload: GmailPayloadPart | undefined): {
  stats: GmailAttachmentPipelineStats;
  raw: GmailAttachmentCandidate[];
} {
  const { raw, stats } = walkGmailPayloadForMaterialization(payload);
  return { raw, stats };
}

/**
 * Candidates to fetch and persist (filters body parts + inline spam).
 */
export function selectGmailAttachmentsToImport(
  payload: GmailPayloadPart | undefined,
  html: string | null | undefined,
): GmailAttachmentCandidate[] {
  const { raw } = measureGmailAttachmentPayload(payload);
  const filtered = raw.filter((c) => shouldExposeGmailAttachment(c, html));
  return filtered.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
}

/** Same as select but returns pipeline stats for logging. */
export function selectGmailAttachmentsToImportWithStats(
  payload: GmailPayloadPart | undefined,
  html: string | null | undefined,
): { candidates: GmailAttachmentCandidate[]; stats: GmailAttachmentPipelineStats } {
  const { raw, stats } = walkGmailPayloadForMaterialization(payload);
  const filtered = raw.filter((c) => shouldExposeGmailAttachment(c, html));
  stats.after_filter = filtered.length;
  return {
    candidates: filtered.slice(0, MAX_ATTACHMENTS_PER_MESSAGE),
    stats,
  };
}
