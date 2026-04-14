import DOMPurify from "dompurify";

const URI_REG =
  /^(?:(?:https?|mailto|tel|cid|callto|sms|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const PURIFY_IFRAME: DOMPurify.Config = {
  WHOLE_DOCUMENT: true,
  ADD_ATTR: ["target", "rel", "charset", "http-equiv", "content", "media", "xmlns"],
  ADD_TAGS: ["style", "link", "meta", "title", "head", "body", "html"],
  ADD_DATA_URI_TAGS: ["img"],
  ALLOWED_URI_REGEXP: URI_REG,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "base", "form", "input", "button"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
};

/**
 * Wrap a fragment so DOMPurify can treat it as a document (head styles, body layout).
 */
export function wrapEmailFragmentAsDocument(html: string): string {
  const t = html.trim();
  if (/^<!DOCTYPE/i.test(t) || /^<html[\s>]/i.test(t)) return html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

/**
 * Client-side sanitization for email HTML shown inside a sandboxed iframe (`srcDoc`).
 * Uses whole-document mode so `<html>`, `<head>`, `<style>`, and `<body>` are preserved when safe.
 */
export function sanitizeEmailHtmlForIframe(raw: string): string {
  const wrapped = wrapEmailFragmentAsDocument(raw);
  return DOMPurify.sanitize(wrapped, PURIFY_IFRAME);
}

/**
 * @returns Sanitized full document, or `null` if sanitization yields nothing useful.
 */
export function trySanitizeEmailHtmlForIframe(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  try {
    const out = sanitizeEmailHtmlForIframe(raw).trim();
    if (out.length === 0) return null;
    return out;
  } catch {
    return null;
  }
}
