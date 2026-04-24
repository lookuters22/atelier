import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { emailIdentityLookupSetsIntersect } from "../identity/identityEmailLookupCandidates.ts";

/** Supabase `.in()` URL limits — stay conservative. */
const PERSON_ID_IN_CHUNK = 120;

/**
 * Resolves a unique `person_id` on the wedding when the inbound email matches a `contact_points`
 * email row for exactly one person (P17 v1: Gmail dot / +tag / googlemail equivalence via intersecting
 * candidate sets — conservative for non-Gmail: exact normalized string only).
 */
export async function fetchUniqueWeddingPersonIdForNormalizedEmail(
  supabase: SupabaseClient,
  photographerId: string,
  normalizedEmail: string,
  weddingPersonIds: readonly string[],
): Promise<string | null> {
  if (weddingPersonIds.length === 0) return null;
  const needle = normalizedEmail.trim().toLowerCase();
  if (!needle) return null;

  const distinct = new Set<string>();
  for (let i = 0; i < weddingPersonIds.length; i += PERSON_ID_IN_CHUNK) {
    const chunk = weddingPersonIds.slice(i, i + PERSON_ID_IN_CHUNK);
    const { data, error } = await supabase
      .from("contact_points")
      .select("person_id, value_normalized")
      .eq("photographer_id", photographerId)
      .eq("kind", "email")
      .in("person_id", chunk);

    if (error) {
      throw new Error(`buildDecisionContext contact_points authority fallback: ${error.message}`);
    }
    for (const row of data ?? []) {
      const vn = String((row as { value_normalized?: string }).value_normalized ?? "");
      if (!vn) continue;
      if (emailIdentityLookupSetsIntersect(needle, vn)) {
        distinct.add((row as { person_id: string }).person_id);
      }
    }
  }

  if (distinct.size !== 1) return null;
  return [...distinct][0] ?? null;
}
