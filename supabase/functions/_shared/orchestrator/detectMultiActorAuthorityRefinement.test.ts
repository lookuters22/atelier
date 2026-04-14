import { describe, expect, it } from "vitest";
import {
  approvalContactNonSenderOnThread,
  detectMultiActorAuthorityRefinement,
  matchesPaidScopeOrCoverageIncreaseIntent,
  matchesPlannerTimelineMaterialReductionIntent,
  verifyMemoryNarrowsPayerOrScopeAuthority,
} from "./detectMultiActorAuthorityRefinement.ts";
import { ORCHESTRATOR_AP1_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";
import type {
  DecisionAudienceSnapshot,
  InboundSenderAuthoritySnapshot,
} from "../../../../src/types/decisionContext.types.ts";

const plannerAuth = (): InboundSenderAuthoritySnapshot => ({
  bucket: "planner",
  personId: "pl1",
  isApprovalContact: false,
  source: "thread_sender",
});

const payerAuth = (): InboundSenderAuthoritySnapshot => ({
  bucket: "payer",
  personId: "mob1",
  isApprovalContact: false,
  source: "thread_sender",
});

const bridePayerApproval = (): InboundSenderAuthoritySnapshot => ({
  bucket: "payer",
  personId: "b1",
  isApprovalContact: true,
  source: "thread_sender",
});

function emptyAudience(): DecisionAudienceSnapshot {
  return {
    threadParticipants: [],
    agencyCcLock: null,
    broadcastRisk: "low",
    recipientCount: 0,
    visibilityClass: "client_visible",
    clientVisibleForPrivateCommercialRedaction: false,
    approvalContactPersonIds: [],
  };
}

/** Planner is sender; bride approval contact on thread as non-sender (no “cc” text needed). */
function audienceWithApprovalContactNonSender(): DecisionAudienceSnapshot {
  return {
    ...emptyAudience(),
    approvalContactPersonIds: ["bride1"],
    threadParticipants: [
      {
        id: "tp-pl",
        person_id: "pl1",
        thread_id: "th1",
        visibility_role: "planner",
        is_cc: false,
        is_recipient: true,
        is_sender: true,
      },
      {
        id: "tp-bride",
        person_id: "bride1",
        thread_id: "th1",
        visibility_role: "client",
        is_cc: false,
        is_recipient: true,
        is_sender: false,
      },
    ],
  };
}

describe("matchesPlannerTimelineMaterialReductionIntent", () => {
  it("matches replay Case B planner portrait cut", () => {
    const msg =
      "[replay] Quick update: I've revised the day-of timeline — we're cutting the couple portrait block from 45 to 20 minutes so the ceremony can start earlier. Please confirm this updated timeline for the photographer team.";
    expect(matchesPlannerTimelineMaterialReductionIntent(msg)).toBe(true);
  });

  it("does not match generic thanks", () => {
    expect(matchesPlannerTimelineMaterialReductionIntent("Thanks — see you Saturday!")).toBe(false);
  });
});

describe("matchesPaidScopeOrCoverageIncreaseIntent", () => {
  it("matches replay Case A payer upsell", () => {
    const msg =
      "[replay] Hi — please add two extra hours on the wedding day and confirm the $800 add-on so I can pay from my card today. Thanks!";
    expect(matchesPaidScopeOrCoverageIncreaseIntent(msg)).toBe(true);
  });
});

describe("verifyMemoryNarrowsPayerOrScopeAuthority", () => {
  it("matches MOB / approval-contact verify-note patterns", () => {
    expect(
      verifyMemoryNarrowsPayerOrScopeAuthority([
        {
          type: "v3_verify_case_note",
          title: "Contract scope — approval contact",
          summary: "No add-on hours without bride approval",
          full_content:
            "VERIFY: MOB payer status does not authorize contract scope changes without written bride approval.",
        },
      ]),
    ).toBe(true);
  });

  it("returns false for unrelated memory", () => {
    expect(
      verifyMemoryNarrowsPayerOrScopeAuthority([
        { type: "note", title: "x", summary: "Parking at venue is tight.", full_content: "" },
      ]),
    ).toBe(false);
  });
});

describe("approvalContactNonSenderOnThread", () => {
  it("is true when an approval-contact participant exists and is not the sender", () => {
    expect(approvalContactNonSenderOnThread(audienceWithApprovalContactNonSender())).toBe(true);
  });

  it("is false when approval contact is the sender", () => {
    const a: DecisionAudienceSnapshot = {
      ...emptyAudience(),
      approvalContactPersonIds: ["bride1"],
      threadParticipants: [
        {
          id: "tp-bride",
          person_id: "bride1",
          thread_id: "th1",
          visibility_role: "client",
          is_cc: false,
          is_recipient: true,
          is_sender: true,
        },
      ],
    };
    expect(approvalContactNonSenderOnThread(a)).toBe(false);
  });

  it("is false when no approval contacts configured", () => {
    expect(approvalContactNonSenderOnThread(emptyAudience())).toBe(false);
  });
});

describe("detectMultiActorAuthorityRefinement", () => {
  it("flags planner timeline reduction for AP1 multi-actor planner class", () => {
    const raw =
      "We're cutting the portrait block from 45 to 20 minutes on the day-of timeline — please align the photo team.";
    const r = detectMultiActorAuthorityRefinement({
      rawMessage: raw,
      authority: plannerAuth(),
      selectedMemories: [],
      audience: emptyAudience(),
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("multi_actor_planner_timeline_reduction_signer");
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.multi_actor_planner_timeline_reduction_signer,
      );
      expect(r.injectionConstraints[0]).toContain("planner");
      expect(r.injectionConstraints[0]).not.toContain("Structured audience");
    }
  });

  it("injects structured-audience line when approval contact on thread is not sender (no cc string)", () => {
    const raw =
      "We're cutting the portrait block from 45 to 20 minutes on the day-of timeline — please align the photo team.";
    const r = detectMultiActorAuthorityRefinement({
      rawMessage: raw,
      authority: plannerAuth(),
      selectedMemories: [],
      audience: audienceWithApprovalContactNonSender(),
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.injectionConstraints[0]).toContain("Structured audience");
    }
  });

  it("does not trigger on harmless current turn when historical cut exists only in thread snippet (regression: no smearing)", () => {
    const r = detectMultiActorAuthorityRefinement({
      rawMessage: "Sounds good, thanks!",
      authority: plannerAuth(),
      selectedMemories: [],
      audience: emptyAudience(),
    });
    expect(r.hit).toBe(false);
  });

  it("flags payer scope/spend without approval contact", () => {
    const r = detectMultiActorAuthorityRefinement({
      rawMessage: "Please add extra hours and confirm the $800 fee today.",
      authority: payerAuth(),
      selectedMemories: [],
      audience: emptyAudience(),
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("multi_actor_payer_scope_spend_signer");
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.multi_actor_payer_scope_spend_signer,
      );
    }
  });

  it("does not flag payer scope when sender is approval contact (binding)", () => {
    const r = detectMultiActorAuthorityRefinement({
      rawMessage: "Please add extra hours and confirm the $800 fee today.",
      authority: bridePayerApproval(),
      selectedMemories: [],
      audience: emptyAudience(),
    });
    expect(r.hit).toBe(false);
  });

  it("does not flag client_primary for planner-only heuristic", () => {
    const r = detectMultiActorAuthorityRefinement({
      rawMessage: "Cut portrait time from 60 to 30 on the timeline.",
      authority: {
        bucket: "client_primary",
        personId: "c1",
        isApprovalContact: true,
        source: "thread_sender",
      },
      selectedMemories: [],
      audience: emptyAudience(),
    });
    expect(r.hit).toBe(false);
  });
});
