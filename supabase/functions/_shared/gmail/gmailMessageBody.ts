/**
 * Decode Gmail API base64url bodies and extract text/plain + text/html from MIME payloads.
 */
import { decodeBase64UrlToBytes } from "./gmailBase64.ts";

export type GmailPayloadPart = {
  mimeType?: string;
  filename?: string;
  partId?: string;
  headers?: { name?: string; value?: string }[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPayloadPart[];
};

const MAX_STORED_BODY_CHARS = 500_000;

export function decodeBase64UrlUtf8(data: string): string {
  return new TextDecoder("utf-8").decode(decodeBase64UrlToBytes(data));
}

/**
 * Walk nested MIME parts; collect all text/plain and text/html leaf bodies, then pick the longest
 * of each (multipart/alternative and nested structures can expose multiple candidates).
 *
 * Keep behavior aligned with `walkGmailPayloadForMaterialization` in `gmailMimeAttachments.ts`
 * (materialization uses that single walk; this helper remains for standalone body parsing).
 */
export function extractPlainAndHtmlFromPayload(
  payload: GmailPayloadPart | undefined,
): { plain: string | null; html: string | null } {
  const plains: string[] = [];
  const htmls: string[] = [];

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
    } else if (mt === "text/html" && part.body?.data) {
      try {
        htmls.push(decodeBase64UrlUtf8(part.body.data));
      } catch {
        /* skip */
      }
    }
  }

  visit(payload);
  const pickLongest = (xs: string[]): string | null =>
    xs.length === 0 ? null : xs.reduce((a, b) => (a.length >= b.length ? a : b));
  return { plain: pickLongest(plains), html: pickLongest(htmls) };
}

/** Strip tags and collapse whitespace; decode common HTML entities (safe text for `messages.body`). */
export function htmlToPlainText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  s = decodeBasicHtmlEntities(s.replace(/\s+/g, " ").trim());
  return s;
}

function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number.parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

/** Prefer plain text; otherwise strip HTML to plain. */
export function preferredCanonicalBody(plain: string | null, html: string | null): string {
  const p = plain?.trim() ?? "";
  if (p.length > 0) return capBody(p);
  const h = html?.trim() ?? "";
  if (h.length > 0) return capBody(htmlToPlainText(h));
  return "";
}

function capBody(s: string): string {
  if (s.length <= MAX_STORED_BODY_CHARS) return s;
  return s.slice(0, MAX_STORED_BODY_CHARS) + "\n\n[Message truncated for storage]";
}
