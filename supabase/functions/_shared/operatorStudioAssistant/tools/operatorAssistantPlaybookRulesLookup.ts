/**
 * Bounded keyword selection over **effective** playbook rules for operator_lookup_playbook_rules.
 * Tenant merge (case exceptions) happens in the caller; this module is pure ranking only.
 */
import type { EffectivePlaybookRule } from "../../../../../src/types/decisionContext.types.ts";

export const OPERATOR_PLAYBOOK_LOOKUP_MAX_ROWS = 12;

function tokenizeQuery(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(/[^a-z0-9]+/g);
  return [...new Set(raw.filter((t) => t.length >= 3))];
}

function ruleBlob(r: EffectivePlaybookRule): string {
  return `${r.action_key} ${r.topic} ${r.instruction ?? ""}`.toLowerCase();
}

/**
 * Ranks effective rules by substring + token overlap on action_key, topic, instruction.
 * Deterministic tie-break: action_key ascending.
 */
export function selectEffectivePlaybookRulesForOperatorLookup(
  rules: EffectivePlaybookRule[],
  query: string,
): EffectivePlaybookRule[] {
  const q = String(query ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (q.length < 3) return [];

  const tokens = tokenizeQuery(q);
  const scored = rules.map((r) => {
    const b = ruleBlob(r);
    let score = 0;
    if (b.includes(q)) score += 12;
    for (const t of tokens) {
      if (t && b.includes(t)) score += 2;
    }
    return { r, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.r.action_key.localeCompare(b.r.action_key);
  });

  const picked = scored.filter((x) => x.score > 0).map((x) => x.r);
  return picked.slice(0, OPERATOR_PLAYBOOK_LOOKUP_MAX_ROWS);
}
