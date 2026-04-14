/**
 * A6: Thread `automation_mode` writes — single owner for per-thread and batch-by-wedding updates.
 * Callers own UI state, loading, and refetch.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type ThreadAutomationMode = "auto" | "draft_only" | "human_only";

export async function updateThreadAutomationMode(
  threadId: string,
  mode: ThreadAutomationMode,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("threads")
    .update({ automation_mode: mode })
    .eq("id", threadId);
  return { error: error ?? null };
}

export async function updateAutomationModeForAllWeddingThreads(
  weddingId: string,
  photographerId: string,
  mode: ThreadAutomationMode,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("threads")
    .update({ automation_mode: mode })
    .eq("wedding_id", weddingId)
    .eq("photographer_id", photographerId);
  return { error: error ?? null };
}
