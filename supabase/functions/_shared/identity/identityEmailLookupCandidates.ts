/**
 * P17 v1 — deterministic email identity lookup candidates (alias expansion).
 * No fuzzy matching: only well-defined Gmail / Googlemail normalization (dots, +tags, domain equivalence).
 * Other providers: exact normalized address only — avoids silent over-linking.
 */
import { normalizeEmail } from "../utils/normalizeEmail.ts";

/**
 * Returns a deduped, bounded list of lowercase emails to try against `contact_points.value_normalized`
 * and tenant-scoped `clients.email` (ilike-exact per candidate).
 *
 * Order is not significant. Size is capped for stable PostgREST URLs.
 */
export function buildEmailIdentityLookupCandidates(normalizedOrRawEmail: string): string[] {
  const e = normalizeEmail(normalizedOrRawEmail);
  if (!e) return [];

  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) {
    return [e];
  }

  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const out = new Set<string>();
  out.add(e);

  const isGmailFamily = domain === "gmail.com" || domain === "googlemail.com";
  if (!isGmailFamily || local.length === 0) {
    return [...out];
  }

  const baseLocal = (local.split("+")[0] ?? "").trim();
  if (baseLocal.length === 0) {
    return [...out];
  }

  const collapsed = baseLocal.replace(/\./g, "");
  out.add(`${collapsed}@gmail.com`);
  out.add(`${collapsed}@googlemail.com`);
  out.add(`${baseLocal}@gmail.com`);
  out.add(`${baseLocal}@googlemail.com`);

  /** Hard cap — Gmail expansion is at most a handful of strings. */
  return [...out].filter((x) => x.includes("@")).slice(0, 12);
}

export function isGmailFamilyEmailNormalized(normalizedEmail: string): boolean {
  const at = normalizedEmail.lastIndexOf("@");
  if (at < 0 || at === normalizedEmail.length - 1) return false;
  const d = normalizedEmail.slice(at + 1);
  return d === "gmail.com" || d === "googlemail.com";
}

/** True when expanded lookup sets intersect (Gmail dot / +tag / googlemail safe). */
export function emailIdentityLookupSetsIntersect(a: string, b: string): boolean {
  const A = new Set(buildEmailIdentityLookupCandidates(a));
  for (const c of buildEmailIdentityLookupCandidates(b)) {
    if (A.has(c)) return true;
  }
  return false;
}

/**
 * True if inbound sender matches any graph email under P17 v1 rules
 * (exact for non-Gmail; Gmail-family uses intersecting expansion).
 */
export function weddingEmailGraphContainsAnyCandidate(
  graphEmails: Set<string> | undefined,
  normalizedSender: string,
): boolean {
  if (!normalizedSender || !graphEmails || graphEmails.size === 0) return false;
  for (const ge of graphEmails) {
    if (emailIdentityLookupSetsIntersect(normalizedSender, ge)) return true;
  }
  return false;
}
