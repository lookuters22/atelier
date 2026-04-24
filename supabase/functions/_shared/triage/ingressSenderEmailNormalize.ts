/**
 * Canonical sender line → bare email for deterministic identity, inquiry dedup, and tenant lookups.
 * Keeps `comms/email.received` and Gmail post-ingest paths aligned on the same normalization rules.
 */
import { classifyEmailLocalPart } from "../utils/emailLocalPartClass.ts";
import { extractEmailAddress } from "../utils/extractEmailAddress.ts";
import { normalizeEmail } from "../utils/normalizeEmail.ts";

export type ResolveIngressIdentitySenderInput = {
  fromOrSenderRaw: string;
  replyToRaw?: string | null;
};

/**
 * Lowercase trimmed bare address when parseable; otherwise normalizes the trimmed raw line.
 *
 * For single-token mailbox lines (no display name / angle brackets), keeps the full local-part
 * verbatim (e.g. `foo%bar@example.com` for SQL `ilike` escaping) instead of letting a substring
 * regex "snap" to the domain-only tail.
 */
export function normalizeIngressSenderEmailForIdentity(fromOrSenderLine: string | null | undefined): string {
  const raw = String(fromOrSenderLine ?? "").trim();
  if (!raw) return "";
  const angle = raw.match(/<([^>]+@[^>]+)>/);
  if (angle?.[1]) return normalizeEmail(angle[1].trim());
  const looksLikeBareMailbox = !raw.includes("<") && /^[^\s@]+@[^\s@]+$/.test(raw);
  if (looksLikeBareMailbox) return normalizeEmail(raw);
  const bare = extractEmailAddress(raw);
  return normalizeEmail(bare ?? raw);
}

/**
 * Email string used for deterministic client identity + inquiry dedup.
 * When `From` is a no-reply envelope and `Reply-To` is present, prefer `Reply-To` for identity only
 * (suppression / header heuristics still use the original `From` elsewhere).
 */
export function resolveIngressIdentitySenderEmail(input: ResolveIngressIdentitySenderInput): string {
  const fromRaw = String(input.fromOrSenderRaw ?? "").trim();
  const replyRaw = String(input.replyToRaw ?? "").trim();

  if (fromRaw && classifyEmailLocalPart(fromRaw) === "no_reply" && replyRaw) {
    /** Require a parseable mailbox — do not treat free-text Reply-To as identity. */
    const bareReply = extractEmailAddress(replyRaw);
    if (bareReply) {
      const norm = normalizeEmail(bareReply);
      if (norm) return norm;
    }
  }

  return normalizeIngressSenderEmailForIdentity(fromRaw);
}
