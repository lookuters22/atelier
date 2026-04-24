/**
 * Reply-side memory visibility: which `memories.audience_source_tier` values may appear
 * for a given thread `audience_tier` / draft context.
 *
 * Tiers are project-type neutral (client / internal team / operator-only).
 */

import type { AudienceVisibilityClass } from "../../../../src/types/decisionContext.types.ts";

export const MEMORY_AUDIENCE_TIERS = ["client_visible", "internal_team", "operator_only"] as const;
export type MemoryAudienceTier = (typeof MEMORY_AUDIENCE_TIERS)[number];

export const THREAD_AUDIENCE_TIERS = MEMORY_AUDIENCE_TIERS;
export type ThreadAudienceTier = MemoryAudienceTier;

const TIER_RANK: Record<MemoryAudienceTier, number> = {
  client_visible: 0,
  internal_team: 1,
  operator_only: 2,
};

export function parseMemoryAudienceTier(raw: unknown): MemoryAudienceTier | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  if ((MEMORY_AUDIENCE_TIERS as readonly string[]).includes(s)) return s as MemoryAudienceTier;
  return null;
}

export function parseThreadAudienceTier(raw: unknown): ThreadAudienceTier {
  const p = parseMemoryAudienceTier(raw);
  return p ?? "client_visible";
}

/**
 * Memory row is eligible for reply context when the memory's tier is at or below
 * the strictness of the thread's tier (lower rank = safe for more contexts).
 */
export function memoryAudienceAllowedForThreadTier(
  memoryTier: MemoryAudienceTier | null,
  threadTier: ThreadAudienceTier,
): boolean {
  const memRank = memoryTier == null ? TIER_RANK.client_visible : TIER_RANK[memoryTier];
  const threadRank = TIER_RANK[threadTier];
  return memRank <= threadRank;
}

export type MemoryHeaderWithOptionalAudience = {
  id: string;
  audience_source_tier?: MemoryAudienceTier | null;
};

export function filterMemoryHeadersForThreadAudienceTier<H extends MemoryHeaderWithOptionalAudience>(
  headers: readonly H[],
  threadTier: ThreadAudienceTier,
): H[] {
  return headers.filter((h) => memoryAudienceAllowedForThreadTier(h.audience_source_tier ?? null, threadTier));
}

function minStrictThreadTier(a: ThreadAudienceTier, b: ThreadAudienceTier): ThreadAudienceTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function maxPermissiveThreadTier(a: ThreadAudienceTier, b: ThreadAudienceTier): ThreadAudienceTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/**
 * Single source of truth for reply-side memory gating: aligns stored `threads.audience_tier` with
 * participant-derived {@link AudienceVisibilityClass} so mixed-audience threads never widen memory
 * from a loose DB value, and planner/vendor threads still see internal-tier rows when the DB column
 * is still default `client_visible`.
 */
export function combineThreadAudienceTierWithVisibilityClass(
  threadAudienceTierFromDb: ThreadAudienceTier,
  visibilityClass: AudienceVisibilityClass,
): ThreadAudienceTier {
  switch (visibilityClass) {
    case "client_visible":
    case "mixed_audience":
      return minStrictThreadTier(threadAudienceTierFromDb, "client_visible");
    case "planner_only":
    case "vendor_only":
      return maxPermissiveThreadTier(threadAudienceTierFromDb, "internal_team");
    case "internal_only":
      return maxPermissiveThreadTier(threadAudienceTierFromDb, "operator_only");
    default:
      return minStrictThreadTier(threadAudienceTierFromDb, "client_visible");
  }
}

/**
 * Drop hydrated memories that are not allowed for the effective reply tier (e.g. after QA visibility override).
 */
export function filterSelectedMemoriesForThreadAudienceTier<
  T extends { audience_source_tier?: ThreadAudienceTier | null },
>(memories: readonly T[], tier: ThreadAudienceTier): T[] {
  return memories.filter((m) => memoryAudienceAllowedForThreadTier(m.audience_source_tier ?? null, tier));
}
