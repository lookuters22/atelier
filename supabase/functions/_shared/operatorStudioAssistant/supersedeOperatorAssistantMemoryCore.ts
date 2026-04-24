/**
 * Tenant-scoped UPDATE: newer memory row points at older superseded id (`memories.supersedes_memory_id`).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ValidatedMemorySupersessionPayload } from "./validateOperatorAssistantMemorySupersessionPayload.ts";
import { recordOperatorAssistantWriteAudit } from "./recordOperatorAssistantWriteAudit.ts";

const CHAIN_WALK_MAX = 32;

type MemorySupersessionRow = {
  id: string;
  photographer_id: string;
  archived_at: string | null;
  supersedes_memory_id: string | null;
};

export class MemorySupersessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MemorySupersessionError";
  }
}

async function fetchMemoryRow(
  supabase: SupabaseClient,
  photographerId: string,
  id: string,
): Promise<MemorySupersessionRow | null> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, photographer_id, archived_at, supersedes_memory_id")
    .eq("id", id)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    throw new MemorySupersessionError(`memory lookup failed: ${error.message}`, 500);
  }
  return data as MemorySupersessionRow | null;
}

/**
 * Walk older chain from `supersededId` via `supersedes_memory_id`. If `supersedingId` appears, the superseded
 * memory is newer than (or equal in chain to) the superseding id — invalid to mark superseding as replacing superseded.
 */
async function supersedingAppearsInOlderChainFromSuperseded(
  supabase: SupabaseClient,
  photographerId: string,
  supersededRow: MemorySupersessionRow,
  supersedingId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  let cur: string | null = supersededRow.supersedes_memory_id;

  for (let i = 0; i < CHAIN_WALK_MAX && cur != null; i++) {
    if (cur === supersedingId) return true;
    if (visited.has(cur)) break;
    visited.add(cur);

    const { data, error } = await supabase
      .from("memories")
      .select("supersedes_memory_id")
      .eq("id", cur)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (error) {
      throw new MemorySupersessionError(`memory chain lookup failed: ${error.message}`, 500);
    }
    cur = (data as { supersedes_memory_id: string | null } | null)?.supersedes_memory_id ?? null;
  }
  return false;
}

export async function supersedeMemoryForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  payload: ValidatedMemorySupersessionPayload,
): Promise<{ supersedingMemoryId: string; supersededMemoryId: string; auditEventId: string }> {
  const { supersedingMemoryId, supersededMemoryId } = payload;

  const [supersedingRow, supersededRow] = await Promise.all([
    fetchMemoryRow(supabase, photographerId, supersedingMemoryId),
    fetchMemoryRow(supabase, photographerId, supersededMemoryId),
  ]);

  if (!supersedingRow || !supersededRow) {
    throw new MemorySupersessionError("one or both memories not found for tenant", 404);
  }

  if (supersedingRow.archived_at != null || supersededRow.archived_at != null) {
    throw new MemorySupersessionError("cannot supersede archived memories", 400);
  }

  if (supersededRow.supersedes_memory_id === supersedingMemoryId) {
    throw new MemorySupersessionError(
      "invalid supersession: superseded memory already references superseding memory",
      409,
    );
  }

  const cycleViaOlderChain = await supersedingAppearsInOlderChainFromSuperseded(
    supabase,
    photographerId,
    supersededRow,
    supersedingMemoryId,
  );
  if (cycleViaOlderChain) {
    throw new MemorySupersessionError(
      "invalid supersession: would create a cycle in supersedes_memory_id chain",
      409,
    );
  }

  const { data: updated, error: upErr } = await supabase
    .from("memories")
    .update({ supersedes_memory_id: supersededMemoryId })
    .eq("id", supersedingMemoryId)
    .eq("photographer_id", photographerId)
    .select("id")
    .maybeSingle();

  if (upErr) {
    throw new MemorySupersessionError(upErr.message, 500);
  }
  if (!updated?.id) {
    throw new MemorySupersessionError("update did not affect a memory row", 500);
  }

  const { auditId } = await recordOperatorAssistantWriteAudit(supabase, photographerId, {
    operation: "memory_supersede",
    entityTable: "memories",
    entityId: supersedingMemoryId,
    detail: {
      supersededMemoryId,
      supersedingMemoryId,
    },
  });

  return {
    supersedingMemoryId,
    supersededMemoryId,
    auditEventId: auditId,
  };
}
