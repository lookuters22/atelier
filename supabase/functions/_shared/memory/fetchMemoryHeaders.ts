import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Matches `AgentContext["memoryHeaders"][number]` in `src/types/agent.types.ts`.
 * Only header fields — never `full_content`.
 */
export type MemoryHeader = {
  id: string;
  /** Null = tenant-wide; used to prefer wedding-scoped rows when `weddingId` is in scope. */
  wedding_id: string | null;
  type: string;
  title: string;
  summary: string;
};

/**
 * Header-scan: load durable memory titles for orchestrator context without full blobs.
 * Always tenant-scoped. When `weddingId` is set, includes that wedding plus tenant-wide rows (`wedding_id` null).
 */
export async function fetchMemoryHeaders(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId?: string | null,
): Promise<MemoryHeader[]> {
  let query = supabase
    .from("memories")
    .select("id, wedding_id, type, title, summary")
    .eq("photographer_id", photographerId);

  const scope = typeof weddingId === "string" && weddingId.length > 0 ? weddingId : null;
  if (scope) {
    query = query.or(`wedding_id.eq.${scope},wedding_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`fetchMemoryHeaders: ${error.message}`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    wedding_id:
      r.wedding_id != null && String(r.wedding_id).trim() !== "" ? String(r.wedding_id).trim() : null,
    type: String(r.type ?? ""),
    title: String(r.title ?? ""),
    summary: String(r.summary ?? ""),
  }));
}
