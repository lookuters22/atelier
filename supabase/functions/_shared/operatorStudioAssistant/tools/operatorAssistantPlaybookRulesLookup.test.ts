import { describe, expect, it } from "vitest";
import {
  OPERATOR_PLAYBOOK_LOOKUP_MAX_ROWS,
  selectEffectivePlaybookRulesForOperatorLookup,
} from "./operatorAssistantPlaybookRulesLookup.ts";
import type { EffectivePlaybookRule } from "../../../../../src/types/decisionContext.types.ts";

function rule(partial: Partial<EffectivePlaybookRule> & Pick<EffectivePlaybookRule, "id" | "action_key">): EffectivePlaybookRule {
  return {
    topic: "",
    decision_mode: "ask_first",
    scope: "global",
    channel: "email",
    instruction: "",
    source_type: "manual",
    confidence_label: null,
    is_active: true,
    effectiveDecisionSource: "playbook",
    appliedAuthorizedExceptionId: null,
    ...partial,
  };
}

describe("selectEffectivePlaybookRulesForOperatorLookup", () => {
  it("returns empty for short query", () => {
    expect(selectEffectivePlaybookRulesForOperatorLookup([], "ab")).toEqual([]);
  });

  it("ranks by token overlap and caps rows", () => {
    const rules: EffectivePlaybookRule[] = [
      rule({
        id: "1",
        action_key: "z_last",
        topic: "travel",
        instruction: "We do not book flights for the couple.",
      }),
      rule({
        id: "2",
        action_key: "deposit_reminder",
        topic: "payments",
        instruction: "Remind about deposit before travel dates.",
      }),
      rule({ id: "3", action_key: "unrelated", topic: "other", instruction: "Something else entirely." }),
    ];
    const out = selectEffectivePlaybookRulesForOperatorLookup(rules, "travel policy couple");
    expect(out.map((r) => r.id)).toContain("1");
    expect(out.map((r) => r.id)).not.toContain("3");
    expect(out.length).toBeLessThanOrEqual(OPERATOR_PLAYBOOK_LOOKUP_MAX_ROWS);
  });

  it("prefers full substring matches in the combined blob", () => {
    const rules: EffectivePlaybookRule[] = [
      rule({
        id: "a",
        action_key: "foo",
        topic: "x",
        instruction: "partial match on deposit only",
      }),
      rule({
        id: "b",
        action_key: "bar",
        topic: "y",
        instruction: "deposit reminder policy for late payments",
      }),
    ];
    const out = selectEffectivePlaybookRulesForOperatorLookup(rules, "deposit reminder policy");
    expect(out[0]!.id).toBe("b");
  });
});
