import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgentContext, ThreadAudienceTier } from "../../../../src/types/agent.types.ts";
import { memoryAudienceAllowedForThreadTier, parseMemoryAudienceTier } from "./memoryAudienceTierPolicy.ts";

/**
 * Fire-and-forget: bump `last_accessed_at` for hydrated memory rows. Does not block callers;
 * errors are logged only. Tenant-scoped via `photographer_id`.
 */
export function touchMemoryLastAccessed(
  supabase: SupabaseClient,
  photographerId: string,
  memoryIds: string[],
): void {
  const ids = [...new Set(memoryIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return;

  void (async () => {
    try {
      const { error } = await supabase
        .from("memories")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("photographer_id", photographerId)
        .in("id", ids);
      if (error) console.error(`touchMemoryLastAccessed: ${error.message}`);
    } catch {
      /* ignore */
    }
  })();
}

/**
 * Step 5C — second stage after `fetchMemoryHeaders`: load full durable memory for selected IDs only.
 * Tenant-safe: `.eq("photographer_id")` plus `.in("id", ...)`.
 * Preserves caller ID order; omits IDs not found or not owned.
 */
export async function fetchSelectedMemoriesFull(
  supabase: SupabaseClient,
  photographerId: string,
  memoryIds: string[],
  options?: { replyThreadAudienceTier?: ThreadAudienceTier },
): Promise<AgentContext["selectedMemories"]> {
  const unique = [...new Set(memoryIds.filter((id) => id.length > 0))];
  if (unique.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("memories")
    .select("id, type, title, summary, full_content, audience_source_tier")
    .eq("photographer_id", photographerId)
    .in("id", unique);

  if (error) {
    throw new Error(`fetchSelectedMemoriesFull: ${error.message}`);
  }

  const threadTier: ThreadAudienceTier = options?.replyThreadAudienceTier ?? "client_visible";

  const byId = new Map<string, AgentContext["selectedMemories"][number]>();
  for (const r of data ?? []) {
    const memTier = parseMemoryAudienceTier((r as { audience_source_tier?: unknown }).audience_source_tier);
    if (!memoryAudienceAllowedForThreadTier(memTier, threadTier)) {
      continue;
    }
    byId.set(r.id, {
      id: r.id,
      type: r.type,
      title: r.title,
      summary: r.summary,
      full_content: r.full_content,
      audience_source_tier: memTier,
    });
  }

  const out: AgentContext["selectedMemories"] = [];
  for (const id of unique) {
    const row = byId.get(id);
    if (row) out.push(row);
  }

  if (out.length > 0) {
    touchMemoryLastAccessed(
      supabase,
      photographerId,
      out.map((r) => r.id),
    );
  }

  return out;
}
