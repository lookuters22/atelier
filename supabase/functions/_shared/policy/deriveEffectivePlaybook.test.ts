import { describe, expect, it } from "vitest";
import { deriveEffectivePlaybook } from "./deriveEffectivePlaybook.ts";
import type {
  AuthorizedCaseExceptionRow,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";

function baseRule(over: Partial<PlaybookRuleContextRow> = {}): PlaybookRuleContextRow {
  return {
    id: "rule-1",
    action_key: "send_message",
    topic: "tone",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction: "Be warm.",
    source_type: "manual",
    confidence_label: "explicit",
    is_active: true,
    ...over,
  };
}

function exRow(
  over: Partial<AuthorizedCaseExceptionRow> & Pick<AuthorizedCaseExceptionRow, "id" | "overrides_action_key">,
): AuthorizedCaseExceptionRow {
  return {
    photographer_id: "p1",
    wedding_id: "w1",
    thread_id: null,
    status: "active",
    target_playbook_rule_id: null,
    override_payload: {},
    approved_by: null,
    approved_via_escalation_id: null,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_until: null,
    notes: null,
    ...over,
  };
}

describe("deriveEffectivePlaybook", () => {
  it("passes through playbook-only rows when no exceptions", () => {
    const raw = [baseRule()];
    const eff = deriveEffectivePlaybook(raw, []);
    expect(eff).toHaveLength(1);
    expect(eff[0].effectiveDecisionSource).toBe("playbook");
    expect(eff[0].appliedAuthorizedExceptionId).toBeNull();
    expect(eff[0].decision_mode).toBe("draft_only");
  });

  it("applies exception matched by target_playbook_rule_id", () => {
    const raw = [baseRule({ id: "r-target" })];
    const exceptions = [
      exRow({
        id: "ex1",
        overrides_action_key: "send_message",
        target_playbook_rule_id: "r-target",
        override_payload: { decision_mode: "auto" },
        effective_from: "2026-06-01T00:00:00.000Z",
      }),
    ];
    const eff = deriveEffectivePlaybook(raw, exceptions);
    expect(eff[0].decision_mode).toBe("auto");
    expect(eff[0].effectiveDecisionSource).toBe("authorized_exception");
    expect(eff[0].appliedAuthorizedExceptionId).toBe("ex1");
  });

  it("applies exception matched by overrides_action_key when target is null", () => {
    const raw = [baseRule({ id: "r1", action_key: "send_message" })];
    const exceptions = [
      exRow({
        id: "ex2",
        overrides_action_key: "send_message",
        target_playbook_rule_id: null,
        override_payload: { instruction_append: "Exception note." },
        effective_from: "2026-06-01T00:00:00.000Z",
      }),
    ];
    const eff = deriveEffectivePlaybook(raw, exceptions);
    expect(eff[0].instruction).toContain("Exception note.");
    expect(eff[0].effectiveDecisionSource).toBe("authorized_exception");
  });

  it("does not apply revoked or inactive (caller filters) — empty exceptions list leaves playbook", () => {
    const raw = [baseRule({ decision_mode: "forbidden" })];
    const eff = deriveEffectivePlaybook(raw, []);
    expect(eff[0].decision_mode).toBe("forbidden");
    expect(eff[0].effectiveDecisionSource).toBe("playbook");
  });

  it("does not match unrelated action_key", () => {
    const raw = [baseRule({ id: "x", action_key: "update_crm" })];
    const exceptions = [
      exRow({
        id: "ex3",
        overrides_action_key: "send_message",
        target_playbook_rule_id: null,
        override_payload: { decision_mode: "auto" },
        effective_from: "2026-06-01T00:00:00.000Z",
      }),
    ];
    const eff = deriveEffectivePlaybook(raw, exceptions);
    expect(eff[0].effectiveDecisionSource).toBe("playbook");
    expect(eff[0].decision_mode).toBe("draft_only");
  });

  it("prefers newer effective_from when two exceptions compete for same rule", () => {
    const raw = [baseRule({ id: "rid" })];
    const exceptions = [
      exRow({
        id: "old",
        overrides_action_key: "send_message",
        target_playbook_rule_id: "rid",
        override_payload: { decision_mode: "ask_first" },
        effective_from: "2026-01-01T00:00:00.000Z",
      }),
      exRow({
        id: "newer",
        overrides_action_key: "send_message",
        target_playbook_rule_id: "rid",
        override_payload: { decision_mode: "auto" },
        effective_from: "2026-12-01T00:00:00.000Z",
      }),
    ];
    const eff = deriveEffectivePlaybook(raw, exceptions);
    expect(eff[0].decision_mode).toBe("auto");
    expect(eff[0].appliedAuthorizedExceptionId).toBe("newer");
  });

  it("merge applies every row in the provided exception list (DB fetch enforces wedding/thread/time scope)", () => {
    const raw = [baseRule()];
    const exceptions = [
      exRow({
        id: "scoped",
        wedding_id: "w1",
        overrides_action_key: "send_message",
        override_payload: { decision_mode: "forbidden" },
        effective_from: "2026-06-01T00:00:00.000Z",
      }),
    ];
    const eff = deriveEffectivePlaybook(raw, exceptions);
    expect(eff[0].decision_mode).toBe("forbidden");
  });
});
