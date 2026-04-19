/**
 * Connected-account "self" mailboxes for Gmail reply safety: primary + Send mail as aliases.
 *
 * Source: `users.settings.sendAs.list` (requires `gmail.settings.basic` on new OAuth connects).
 * On fetch failure or missing scope, falls back to primary only (conservative).
 */
import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";
import { mergeSelfMailboxList } from "./mailboxNormalize.ts";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_HTTP_TIMEOUT_MS = 15_000;

/** Parse JSON body from Gmail `users.settings.sendAs` list response (test hook). */
export function extractSendAsEmailsFromGmailResponse(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const rec = body as { sendAs?: unknown };
  if (!Array.isArray(rec.sendAs)) return [];
  const out: string[] = [];
  for (const row of rec.sendAs) {
    if (!row || typeof row !== "object") continue;
    const em = (row as { sendAsEmail?: unknown }).sendAsEmail;
    if (typeof em === "string" && em.trim()) out.push(em.trim());
  }
  return out;
}

export async function fetchGmailSendAsAddresses(accessToken: string): Promise<
  { ok: true; addresses: string[] } | { ok: false; status: number; error: string }
> {
  const res = await fetchWithTimeout(`${GMAIL_BASE}/settings/sendAs`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: `Gmail settings.sendAs failed: ${res.status} ${text.slice(0, 400)}`,
    };
  }
  try {
    const json = JSON.parse(text) as unknown;
    return { ok: true, addresses: extractSendAsEmailsFromGmailResponse(json) };
  } catch {
    return { ok: false, status: res.status, error: "Gmail settings.sendAs: invalid JSON" };
  }
}

/**
 * Primary `connected_accounts.email` plus all Gmail send-as addresses, deduped by
 * `normalizeMailboxForComparison`.
 */
export async function resolveConnectedGoogleSelfMailboxes(
  accessToken: string,
  primaryConnectedEmail: string,
): Promise<string[]> {
  const primary = primaryConnectedEmail.trim();
  if (!primary) return [];

  const sendAs = await fetchGmailSendAsAddresses(accessToken);
  if (!sendAs.ok) {
    console.warn(
      "[gmailSelfMailboxes] sendAs list unavailable; using primary connected email only:",
      sendAs.error.slice(0, 240),
    );
    return mergeSelfMailboxList(primary, []);
  }
  return mergeSelfMailboxList(primary, sendAs.addresses);
}
