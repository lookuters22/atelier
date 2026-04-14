import type { InboundSenderIdentity } from "../../../../src/types/decisionContext.types.ts";

/**
 * Extract a bare RFC-ish email from ingress strings that may include display names
 * (`Name <user@host>`) or be already normalized.
 */
export function extractBareEmailFromIngress(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const angle = t.match(/<([^<>]+@[^<>]+)>/);
  const candidate = (angle ? angle[1] : t).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate.toLowerCase();
}

export function deriveRegistrableDomainFromEmail(email: string): string | null {
  const bare = extractBareEmailFromIngress(email);
  if (!bare) return null;
  const at = bare.lastIndexOf("@");
  if (at < 0 || at === bare.length - 1) return null;
  return bare.slice(at + 1).toLowerCase();
}

export function buildInboundSenderIdentityFromIngress(options: {
  inboundSenderEmail?: string | null;
  inboundSenderDisplayName?: string | null;
}): InboundSenderIdentity | null {
  const email =
    options.inboundSenderEmail != null && String(options.inboundSenderEmail).trim().length > 0
      ? extractBareEmailFromIngress(String(options.inboundSenderEmail))
      : null;
  const displayRaw = options.inboundSenderDisplayName;
  const displayName =
    displayRaw != null && String(displayRaw).trim().length > 0
      ? String(displayRaw).trim()
      : null;
  const domain = email ? deriveRegistrableDomainFromEmail(email) : null;
  if (!email && !displayName) return null;
  return { email, displayName, domain };
}
