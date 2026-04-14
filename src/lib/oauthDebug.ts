/**
 * Dev-only helpers for Gmail OAuth debugging (client id is public; still masked in console).
 * Keep in sync with `supabase/functions/_shared/gmail/googleOAuthDebug.ts`.
 */
export function maskGoogleOAuthClientId(clientId: string | undefined | null): string {
  if (!clientId || !clientId.trim()) return "(empty)";
  const s = clientId.trim();
  if (s.length <= 24) return `${s.slice(0, 8)}…${s.slice(-4)}`;
  return `${s.slice(0, 12)}…${s.slice(-10)}`;
}
