import { describe, expect, it } from "vitest";
import {
  evaluateVerifierPolicyGate,
  filterPlaybookRulesForVerifierPolicyMerge,
  mergePlaybookDecisionModes,
  resolveVerifierPolicyEvaluationActionKey,
  VERIFIER_REASON_CODES,
} from "./verifierPolicyGate.ts";

const baseGate = (over: Partial<import("./verifierPolicyGate.ts").VerifierPolicyGateInput> = {}) => ({
  audience: {
    visibilityClass: "client_visible",
    clientVisibleForPrivateCommercialRedaction: true,
    broadcastRisk: "low",
    recipientCount: 2,
  },
  playbookRules: [],
  selectedMemoriesSummary: [],
  globalKnowledgeLoadedCount: 0,
  escalationOpenCount: 0,
  ...over,
});

describe("filterPlaybookRulesForVerifierPolicyMerge", () => {
  it("returns all rules when evaluation key is omitted (legacy)", () => {
    const rules = [
      { id: "1", action_key: "a", decision_mode: "auto" as const, topic: "t", is_active: true },
      { id: "2", action_key: "b", decision_mode: "forbidden" as const, topic: "t2", is_active: true },
    ];
    expect(filterPlaybookRulesForVerifierPolicyMerge(rules, undefined)).toEqual(rules);
  });

  it("keeps only rows matching the evaluation action_key", () => {
    const rules = [
      { id: "1", action_key: "send_message", decision_mode: "draft_only" as const, topic: "t", is_active: true },
      { id: "2", action_key: "other", decision_mode: "forbidden" as const, topic: "t2", is_active: true },
    ];
    expect(filterPlaybookRulesForVerifierPolicyMerge(rules, "send_message")).toEqual([rules[0]]);
  });
});

describe("resolveVerifierPolicyEvaluationActionKey", () => {
  it("prefers a non-send_message playbook-backed send_message proposal", () => {
    const k = resolveVerifierPolicyEvaluationActionKey([
      {
        id: "c1",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "r",
        verifier_gating_required: true,
        likely_outcome: "auto",
        blockers_or_missing_facts: [],
      },
      {
        id: "c2",
        action_family: "send_message",
        action_key: "v3_rtrp_replay_vendor_delivery_high_res",
        rationale: "r2",
        verifier_gating_required: true,
        likely_outcome: "auto",
        blockers_or_missing_facts: [],
        playbook_rule_ids: ["rule-uuid"],
      },
    ]);
    expect(k).toBe("v3_rtrp_replay_vendor_delivery_high_res");
  });

  it("falls back to send_message when only generic playbook rows exist", () => {
    const k = resolveVerifierPolicyEvaluationActionKey([
      {
        id: "c2",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "r2",
        verifier_gating_required: true,
        likely_outcome: "auto",
        blockers_or_missing_facts: [],
        playbook_rule_ids: ["rule-uuid"],
      },
    ]);
    expect(k).toBe("send_message");
  });
});

describe("mergePlaybookDecisionModes", () => {
  it("returns null when no active rules constrain auto", () => {
    expect(
      mergePlaybookDecisionModes([
        { id: "1", action_key: "send_message", decision_mode: "auto", topic: "t", is_active: true },
      ]),
    ).toBeNull();
  });

  it("picks strongest constraint across active rules", () => {
    expect(
      mergePlaybookDecisionModes([
        { id: "1", action_key: "send_message", decision_mode: "draft_only", topic: "t", is_active: true },
        { id: "2", action_key: "send_message", decision_mode: "ask_first", topic: "t2", is_active: true },
      ]),
    ).toBe("ask_first");
  });

  it("ignores inactive rules", () => {
    expect(
      mergePlaybookDecisionModes([
        { id: "1", action_key: "send_message", decision_mode: "forbidden", topic: "t", is_active: false },
      ]),
    ).toBeNull();
  });
});

describe("evaluateVerifierPolicyGate", () => {
  it("passes allow_auto for clean auto path", () => {
    const r = evaluateVerifierPolicyGate(baseGate(), "auto");
    expect(r.outcome).toBe("pass");
  });

  it("hard-fails when open escalations block auto", () => {
    const r = evaluateVerifierPolicyGate(baseGate({ escalationOpenCount: 1 }), "auto");
    expect(r.outcome).toBe("hard_fail");
    if (r.outcome === "hard_fail") {
      expect(r.reasonCodes).toContain(VERIFIER_REASON_CODES.OPEN_ESCALATION_BLOCKS_AUTO);
    }
  });

  it("hard-fails internal_only audience for auto", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        audience: {
          visibilityClass: "internal_only",
          clientVisibleForPrivateCommercialRedaction: false,
          broadcastRisk: "low",
          recipientCount: 1,
        },
      }),
      "auto",
    );
    expect(r.outcome).toBe("hard_fail");
    if (r.outcome === "hard_fail") {
      expect(r.reasonCodes).toContain(VERIFIER_REASON_CODES.AUDIENCE_INTERNAL_ONLY_BLOCKS_AUTO);
    }
  });

  it("ignores unrelated strict playbook rows when policyEvaluationActionKey scopes merge", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        policyEvaluationActionKey: "send_message",
        playbookRules: [
          {
            id: "r1",
            action_key: "send_message",
            decision_mode: "auto",
            topic: "t",
            is_active: true,
          },
          {
            id: "r2",
            action_key: "other_action",
            decision_mode: "forbidden",
            topic: "t2",
            is_active: true,
          },
        ],
      }),
      "auto",
    );
    expect(r.outcome).toBe("pass");
  });

  it("coerces ask_first from playbook", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        playbookRules: [
          {
            id: "r1",
            action_key: "send_message",
            decision_mode: "ask_first",
            topic: "commercial",
            is_active: true,
          },
        ],
      }),
      "auto",
    );
    expect(r.outcome).toBe("coerce");
    if (r.outcome === "coerce") {
      expect(r.policyVerdict).toBe("require_ask");
      expect(r.reasonCodes).toContain(VERIFIER_REASON_CODES.PLAYBOOK_ASK_FIRST);
    }
  });

  it("coerces draft_only from playbook", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        playbookRules: [
          {
            id: "r1",
            action_key: "send_message",
            decision_mode: "draft_only",
            topic: "t",
            is_active: true,
          },
        ],
      }),
      "auto",
    );
    expect(r.outcome).toBe("coerce");
    if (r.outcome === "coerce") {
      expect(r.policyVerdict).toBe("require_draft_only");
    }
  });

  it("hard-fails forbidden playbook", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        playbookRules: [
          {
            id: "r1",
            action_key: "send_message",
            decision_mode: "forbidden",
            topic: "t",
            is_active: true,
          },
        ],
      }),
      "auto",
    );
    expect(r.outcome).toBe("hard_fail");
  });

  it("coerces draft when v3_verify_case_note memory is present", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        selectedMemoriesSummary: [{ id: "m1", type: "v3_verify_case_note" }],
      }),
      "auto",
    );
    expect(r.outcome).toBe("coerce");
    if (r.outcome === "coerce") {
      expect(r.policyVerdict).toBe("require_draft_only");
      expect(r.reasonCodes).toContain(VERIFIER_REASON_CODES.CASE_MEMORY_VERIFY_NOTE_DRAFT);
    }
  });

  it("does not apply auto-only gates when mode is draft_only", () => {
    const r = evaluateVerifierPolicyGate(baseGate({ escalationOpenCount: 99 }), "draft_only");
    expect(r.outcome).toBe("pass");
  });

  it("hard-fails vendor_only audience for auto", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        audience: {
          visibilityClass: "vendor_only",
          clientVisibleForPrivateCommercialRedaction: true,
          broadcastRisk: "low",
          recipientCount: 2,
        },
      }),
      "auto",
    );
    expect(r.outcome).toBe("hard_fail");
    if (r.outcome === "hard_fail") {
      expect(r.reasonCodes).toContain(VERIFIER_REASON_CODES.AUDIENCE_VENDOR_ONLY_BLOCKS_AUTO);
    }
  });

  it("coerces draft for client-visible commercial redaction + loaded memory metadata", () => {
    const r = evaluateVerifierPolicyGate(
      baseGate({
        selectedMemoriesSummary: [{ id: "m1", type: "note" }],
        audience: {
          visibilityClass: "mixed_audience",
          clientVisibleForPrivateCommercialRedaction: true,
          broadcastRisk: "low",
          recipientCount: 3,
        },
      }),
      "auto",
    );
    expect(r.outcome).toBe("coerce");
    if (r.outcome === "coerce") {
      expect(r.reasonCodes).toContain(VERIFIER_REASON_CODES.COMMERCIAL_CLIENT_VISIBLE_MEMORY_REVIEW);
    }
  });
});
