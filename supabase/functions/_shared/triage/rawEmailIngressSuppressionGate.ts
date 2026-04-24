/**
 * Deterministic non-client / non-inquiry gate for `comms/email.received` before triage LLM.
 * Reuses `classifyInboundSuppression` (same buckets as Gmail post-ingest Layer 1b).
 */
import {
  classifyInboundSuppression,
  type InboundSuppressionClassification,
} from "../../../../src/lib/inboundSuppressionClassifier.ts";

/** Optional headers on `raw_email` payloads (shape varies by ingress). */
export function extractEmailHeadersForSuppression(
  rawEmail: Record<string, unknown> | null | undefined,
): Record<string, string> | null {
  if (!rawEmail || typeof rawEmail !== "object") return null;
  const h = rawEmail.headers ?? rawEmail.Headers;
  if (h == null || typeof h !== "object") return null;

  const out: Record<string, string> = {};

  if (Array.isArray(h)) {
    for (const item of h) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const nameRaw = o.name ?? o.Name;
      const valueRaw = o.value ?? o.Value;
      if (typeof nameRaw !== "string" || typeof valueRaw !== "string") continue;
      const name = nameRaw.trim().toLowerCase();
      const value = valueRaw.trim();
      if (!name || !value) continue;
      out[name] = value;
    }
  } else {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim().length > 0) {
        out[String(k).toLowerCase()] = v.trim();
      }
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** First non-empty `Reply-To` line from a `raw_email`-shaped payload, if headers are present. */
export function extractReplyToFromRawEmailPayload(
  rawEmail: Record<string, unknown> | null | undefined,
): string | null {
  const headers = extractEmailHeadersForSuppression(rawEmail);
  if (!headers) return null;
  const v = headers["reply-to"] ?? headers["reply_to"];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export function evaluateRawEmailIngressSuppression(input: {
  rawEmail: Record<string, unknown> | null | undefined;
  senderRaw: string;
  subject: string;
  body: string;
}): InboundSuppressionClassification {
  const headers = extractEmailHeadersForSuppression(input.rawEmail);
  return classifyInboundSuppression({
    senderRaw: input.senderRaw,
    subject: input.subject,
    body: input.body,
    headers,
  });
}
