/**
 * Detects first studio-authored outbound on the thread for inquiry first-touch voice hints.
 * Uses the same `recentMessages` shape as `formatCompactContinuityForPersonaWriter` (direction "out" = Studio).
 */
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";

export function isFirstStudioOutboundOnThread(dc: DecisionContext): boolean {
  const msgs = dc.recentMessages ?? [];
  if (msgs.length === 0) return true;
  return !msgs.some((m) => String(m.direction ?? "").toLowerCase() === "out");
}
