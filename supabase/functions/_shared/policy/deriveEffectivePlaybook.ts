/**
 * Deterministic merge of tenant `playbook_rules` with **active** `authorized_case_exceptions`.
 *
 * Truth hierarchy:
 * - Baseline structured policy = `playbook_rules` (raw rows from DB).
 * - Only schema-backed **authorized_case_exceptions** may narrow policy for a case; ordinary memory does not.
 * - Merge is pure TypeScript — no LLM conflict resolution.
 *
 * Precedence for matching an exception to a rule (first match wins, list pre-sorted newest-first):
 * 1. `target_playbook_rule_id === rule.id`
 * 2. Else `target_playbook_rule_id` is null and `overrides_action_key === rule.action_key`
 */
import type { Database } from "../../../../src/types/database.types.ts";
import type {
  AuthorizedCaseExceptionOverridePayload,
  AuthorizedCaseExceptionRow,
  EffectivePlaybookRule,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";

function parseOverridePayload(row: AuthorizedCaseExceptionRow): AuthorizedCaseExceptionOverridePayload {
  const raw = row.override_payload;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const out: AuthorizedCaseExceptionOverridePayload = {};
  const dm = o.decision_mode;
  if (
    dm === "auto" ||
    dm === "draft_only" ||
    dm === "ask_first" ||
    dm === "forbidden"
  ) {
    out.decision_mode = dm;
  }
  if ("instruction_override" in o) {
    const v = o.instruction_override;
    out.instruction_override = v === null ? null : typeof v === "string" ? v : undefined;
  }
  if ("instruction_append" in o && typeof o.instruction_append === "string") {
    out.instruction_append = o.instruction_append;
  }
  return out;
}

function pickExceptionForRule(
  rule: PlaybookRuleContextRow,
  exceptionsNewestFirst: AuthorizedCaseExceptionRow[],
): AuthorizedCaseExceptionRow | null {
  for (const ex of exceptionsNewestFirst) {
    if (ex.target_playbook_rule_id && ex.target_playbook_rule_id === rule.id) {
      return ex;
    }
  }
  for (const ex of exceptionsNewestFirst) {
    if (!ex.target_playbook_rule_id && ex.overrides_action_key === rule.action_key) {
      return ex;
    }
  }
  return null;
}

function applyException(
  rule: PlaybookRuleContextRow,
  ex: AuthorizedCaseExceptionRow,
): EffectivePlaybookRule {
  const p = parseOverridePayload(ex);
  let instruction: string | null | undefined = rule.instruction;
  if (p.instruction_override !== undefined) {
    instruction = p.instruction_override === null ? "" : p.instruction_override;
  } else if (p.instruction_append && p.instruction_append.trim().length > 0) {
    const base = rule.instruction ?? "";
    instruction = `${base}\n\n${p.instruction_append.trim()}`;
  }

  let decision_mode = rule.decision_mode;
  if (p.decision_mode) {
    decision_mode = p.decision_mode as Database["public"]["Enums"]["decision_mode"];
  }

  return {
    ...rule,
    instruction: instruction ?? rule.instruction,
    decision_mode,
    effectiveDecisionSource: "authorized_exception",
    appliedAuthorizedExceptionId: ex.id,
  };
}

/**
 * Produces one effective rule per raw playbook row, preserving row order.
 */
export function deriveEffectivePlaybook(
  rawRules: PlaybookRuleContextRow[],
  activeExceptions: AuthorizedCaseExceptionRow[],
): EffectivePlaybookRule[] {
  const sortedEx = [...activeExceptions].sort((a, b) => {
    const t = b.effective_from.localeCompare(a.effective_from);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });

  return rawRules.map((rule) => {
    const ex = pickExceptionForRule(rule, sortedEx);
    if (!ex) {
      return {
        ...rule,
        effectiveDecisionSource: "playbook",
        appliedAuthorizedExceptionId: null,
      };
    }
    return applyException(rule, ex);
  });
}
