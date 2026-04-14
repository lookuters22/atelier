import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Supabase `.in()` URL limits — stay conservative. */
const PERSON_ID_IN_CHUNK = 120;

/**
 * Exact `contact_points.value_normalized` match, tenant-scoped, restricted to `person_id`s on the wedding.
 * Returns a `person_id` only when exactly one distinct person matches across all chunks; otherwise null.
 */
export async function fetchUniqueWeddingPersonIdForNormalizedEmail(
  supabase: SupabaseClient,
  photographerId: string,
  normalizedEmail: string,
  weddingPersonIds: readonly string[],
): Promise<string | null> {
  if (weddingPersonIds.length === 0) return null;

  const distinct = new Set<string>();
  for (let i = 0; i < weddingPersonIds.length; i += PERSON_ID_IN_CHUNK) {
    const chunk = weddingPersonIds.slice(i, i + PERSON_ID_IN_CHUNK);
    const { data, error } = await supabase
      .from("contact_points")
      .select("person_id")
      .eq("photographer_id", photographerId)
      .eq("kind", "email")
      .eq("value_normalized", normalizedEmail)
      .in("person_id", chunk);

    if (error) {
      throw new Error(`buildDecisionContext contact_points authority fallback: ${error.message}`);
    }
    for (const row of data ?? []) {
      distinct.add(row.person_id as string);
    }
  }

  if (distinct.size !== 1) return null;
  return [...distinct][0] ?? null;
}
