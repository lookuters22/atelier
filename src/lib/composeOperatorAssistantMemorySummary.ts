/**
 * Operator Ana `memory_note` — deterministic summary line for DB + header-only consumers.
 * Leading **outcome** (decision / result); optional supplementary line from the model after " — ".
 */
export const MAX_OPERATOR_MEMORY_OUTCOME_CHARS = 360;

export function composeOperatorAssistantMemorySummaryForStorage(
  outcome: string,
  supplementarySummary: string,
  maxLen = 400,
): string {
  const o = outcome.trim();
  const s = supplementarySummary.trim();
  if (!o) {
    if (!s) return "";
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  }
  if (!s || s === o) {
    return o.length > maxLen ? o.slice(0, maxLen) : o;
  }
  const combined = `${o} — ${s}`;
  return combined.length > maxLen ? combined.slice(0, maxLen) : combined;
}
