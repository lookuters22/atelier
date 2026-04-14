/**
 * Safe diagnostics for Gmail OAuth (no secrets in logs — client id is public but masked for ergonomics).
 */

/** Mask OAuth client id for logs (never log client secret). */
export function maskGoogleOAuthClientId(clientId: string | undefined | null): string {
  if (!clientId || !clientId.trim()) return "(empty)";
  const s = clientId.trim();
  if (s.length <= 24) return `${s.slice(0, 8)}…${s.slice(-4)}`;
  return `${s.slice(0, 12)}…${s.slice(-10)}`;
}
