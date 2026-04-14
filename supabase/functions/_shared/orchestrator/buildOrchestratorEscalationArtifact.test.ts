import { describe, expect, it } from "vitest";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import { pickEscalationContextCandidate } from "./buildOrchestratorEscalationArtifact.ts";

describe("pickEscalationContextCandidate", () => {
  it("prefers operator when send_message is blocked (Phase 4.1)", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "cand-1-send_message",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "blocked",
        verifier_gating_required: true,
        likely_outcome: "block",
        blockers_or_missing_facts: ["non_commercial_high_risk:NC_ARTISTIC_DISPUTE_V1"],
        risk_class: "artistic_dispute",
        escalation_reason_code: "NC_ARTISTIC_DISPUTE_V1",
      },
      {
        id: "cand-2-operator_notification_routing_nc",
        action_family: "operator_notification_routing",
        action_key: "operator_notification_routing",
        rationale: "operator nc",
        verifier_gating_required: true,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
        risk_class: "artistic_dispute",
        escalation_reason_code: "NC_ARTISTIC_DISPUTE_V1",
      },
    ];
    const picked = pickEscalationContextCandidate(proposals);
    expect(picked?.action_family).toBe("operator_notification_routing");
  });

  it("still prefers non-blocked send_message when present", () => {
    const proposals: OrchestratorProposalCandidate[] = [
      {
        id: "s",
        action_family: "send_message",
        action_key: "send_message",
        rationale: "ok",
        verifier_gating_required: true,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
      },
      {
        id: "o",
        action_family: "operator_notification_routing",
        action_key: "operator_notification_routing",
        rationale: "op",
        verifier_gating_required: true,
        likely_outcome: "draft",
        blockers_or_missing_facts: [],
      },
    ];
    expect(pickEscalationContextCandidate(proposals)?.id).toBe("s");
  });
});
