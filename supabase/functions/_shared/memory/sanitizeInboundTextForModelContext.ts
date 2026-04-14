/**
 * V3 security slice — bound and scrub inbound text before it is embedded in writer/orchestrator-adjacent prompts.
 * Does not replace RBAC; reduces accidental exfiltration of huge/binary pasted payloads into model context.
 */
import { stripInlineDataUrlsFromText } from "./attachmentSafetyForModelContext.ts";

/** Hard cap for any single inbound blob (email body, message body) in model-facing strings. */
export const MAX_INBOUND_TEXT_CHARS_FOR_MODEL = 12_000;

const CONTROL_OR_BINARY_THRESHOLD = 0.06;

function controlOrBinaryRatio(s: string): number {
  if (s.length === 0) return 0;
  let bad = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) continue;
    if (c < 0x20 || c === 0x7f) bad++;
  }
  return bad / s.length;
}

/**
 * Truncate very large strings and replace binary-like content with a placeholder.
 * Safe to call on null/undefined (coerces to empty).
 */
export function sanitizeInboundTextForModelContext(raw: string | null | undefined): string {
  const s0 = typeof raw === "string" ? raw : "";
  const s = stripInlineDataUrlsFromText(s0);
  if (s.length === 0) return "";

  if (controlOrBinaryRatio(s) > CONTROL_OR_BINARY_THRESHOLD) {
    return "[inbound content omitted: non-text or high-control-character payload]";
  }

  if (s.length <= MAX_INBOUND_TEXT_CHARS_FOR_MODEL) return s;

  return (
    s.slice(0, MAX_INBOUND_TEXT_CHARS_FOR_MODEL).trimEnd() +
    "… [truncated for model context safety]"
  );
}
