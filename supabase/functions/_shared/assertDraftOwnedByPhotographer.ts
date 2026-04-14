/**
 * A6: Single ownership check for draft approval / resolution flows.
 * Draft must belong to a thread whose photographer_id matches the JWT tenant.
 */
import { supabaseAdmin } from "./supabase.ts";

export async function assertDraftOwnedByPhotographer(
  draftId: string,
  photographerId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("drafts")
    .select("id, threads!inner(photographer_id)")
    .eq("id", draftId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  const thread = data.threads as unknown as { photographer_id: string };
  return thread.photographer_id === photographerId;
}
