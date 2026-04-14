/**
 * A6: pending_approval → processing_rewrite (reject / request-rewrite path only).
 * Caller must have already verified tenant ownership.
 */
import { supabaseAdmin } from "./supabase.ts";

export async function transitionDraftPendingToProcessingRewrite(
  draftId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabaseAdmin
    .from("drafts")
    .update({ status: "processing_rewrite" })
    .eq("id", draftId)
    .eq("status", "pending_approval");

  return { error: error?.message ?? null };
}
