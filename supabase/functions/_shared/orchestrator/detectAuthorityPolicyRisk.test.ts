import { describe, expect, it } from "vitest";
import {
  detectAmbiguousApprovalAuthorityRisk,
  detectAuthorityPolicyRisk,
  detectCommercialTermsAuthorityRisk,
} from "./detectAuthorityPolicyRisk.ts";
import { ORCHESTRATOR_AP1_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";
import type {
  DecisionAudienceSnapshot,
  InboundSenderAuthoritySnapshot,
} from "../../../../src/types/decisionContext.types.ts";

const EMPTY_AUDIENCE_MULTI: DecisionAudienceSnapshot = {
  threadParticipants: [],
  agencyCcLock: null,
  broadcastRisk: "low",
  recipientCount: 0,
  visibilityClass: "client_visible",
  clientVisibleForPrivateCommercialRedaction: false,
  approvalContactPersonIds: [],
};

const unresolved = (): InboundSenderAuthoritySnapshot => ({
  bucket: "unknown",
  personId: null,
  isApprovalContact: false,
  source: "unresolved",
});

const vendor = (): InboundSenderAuthoritySnapshot => ({
  bucket: "vendor",
  personId: "v1",
  isApprovalContact: false,
  source: "thread_sender",
});

const payer = (): InboundSenderAuthoritySnapshot => ({
  bucket: "payer",
  personId: "p1",
  isApprovalContact: false,
  source: "thread_sender",
});

const planner = (): InboundSenderAuthoritySnapshot => ({
  bucket: "planner",
  personId: "pl1",
  isApprovalContact: false,
  source: "thread_sender",
});

describe("detectCommercialTermsAuthorityRisk", () => {
  it("hits for discount ask when sender is vendor", () => {
    const r = detectCommercialTermsAuthorityRisk(
      "Can we get a bulk discount for 500 extra photos?",
      undefined,
      vendor(),
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("commercial_terms_authority_insufficient");
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.commercial_terms_authority_insufficient,
      );
    }
  });

  it("no hit for same text when payer", () => {
    const r = detectCommercialTermsAuthorityRisk(
      "Can we get a bulk discount for 500 extra photos?",
      undefined,
      payer(),
    );
    expect(r.hit).toBe(false);
  });

  it("hit for discount ask when sender is planner (Phase 2 — commitment tier)", () => {
    const r = detectCommercialTermsAuthorityRisk(
      "Can we get a bulk discount for 500 extra photos?",
      undefined,
      planner(),
    );
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("commercial_terms_authority_insufficient");
    }
  });

  const coordinationMsg =
    "Please cc accounting@example.com on this thread for the invoice copy.";

  it("no hit for invoice-routing coordination when planner", () => {
    const r = detectCommercialTermsAuthorityRisk(coordinationMsg, undefined, planner());
    expect(r.hit).toBe(false);
  });

  it("hit for coordination when sender is vendor", () => {
    const r = detectCommercialTermsAuthorityRisk(coordinationMsg, undefined, vendor());
    expect(r.hit).toBe(true);
  });

  it("no hit for chit-chat without commercial shape", () => {
    const r = detectCommercialTermsAuthorityRisk("Thanks — sounds great!", undefined, vendor());
    expect(r.hit).toBe(false);
  });
});

describe("detectAmbiguousApprovalAuthorityRisk", () => {
  it("no hit for creative-only approval ask without commercial anchor (Phase 3)", () => {
    const auth: InboundSenderAuthoritySnapshot = {
      bucket: "planner",
      personId: "pl1",
      isApprovalContact: false,
      source: "thread_sender",
    };
    const r = detectAmbiguousApprovalAuthorityRisk(
      "Please approve the final seating chart for the couple.",
      undefined,
      auth,
    );
    expect(r.hit).toBe(false);
  });

  it("hits when planner uses binding on-behalf / proceed language (Phase 3)", () => {
    const auth: InboundSenderAuthoritySnapshot = {
      bucket: "planner",
      personId: "pl1",
      isApprovalContact: false,
      source: "thread_sender",
    };
    const r = detectAmbiguousApprovalAuthorityRisk(
      "On behalf of the couple, please proceed with the deposit.",
      undefined,
      auth,
    );
    expect(r.hit).toBe(true);
  });

  it("no hit: on behalf + timeline review without binding/commercial anchor", () => {
    const r = detectAmbiguousApprovalAuthorityRisk(
      "On behalf of the couple, please review the timeline.",
      undefined,
      planner(),
    );
    expect(r.hit).toBe(false);
  });

  it("no hit: on behalf + seating chart without binding/commercial anchor", () => {
    const r = detectAmbiguousApprovalAuthorityRisk(
      "On behalf of the bride, here is the seating chart.",
      undefined,
      planner(),
    );
    expect(r.hit).toBe(false);
  });

  it("hit: on behalf + approve + commercial anchor (addendum)", () => {
    const r = detectAmbiguousApprovalAuthorityRisk(
      "On behalf of the client, approve the contract addendum.",
      undefined,
      planner(),
    );
    expect(r.hit).toBe(true);
  });

  it("no hit for payer with binding approval language", () => {
    const r = detectAmbiguousApprovalAuthorityRisk(
      "Please approve the contract addendum.",
      undefined,
      payer(),
    );
    expect(r.hit).toBe(false);
  });

  it("no hit for casual positivity", () => {
    const r = detectAmbiguousApprovalAuthorityRisk("Sounds good, thanks!", undefined, planner());
    expect(r.hit).toBe(false);
  });

  it("no hit for I authorize without commercial anchor (Phase 3 cleanup)", () => {
    const r = detectAmbiguousApprovalAuthorityRisk(
      "I authorize the seating chart change.",
      undefined,
      planner(),
    );
    expect(r.hit).toBe(false);
  });

  it("hit for I authorize with commercial anchor", () => {
    const r = detectAmbiguousApprovalAuthorityRisk(
      "I authorize the contract addendum.",
      undefined,
      planner(),
    );
    expect(r.hit).toBe(true);
  });

  it("no hit when approval contact", () => {
    const auth: InboundSenderAuthoritySnapshot = {
      bucket: "assistant_or_team",
      personId: "a1",
      isApprovalContact: true,
      source: "thread_sender",
    };
    const r = detectAmbiguousApprovalAuthorityRisk("Please approve the contract addendum.", undefined, auth);
    expect(r.hit).toBe(false);
  });
});

describe("detectAuthorityPolicyRisk", () => {
  it("commercial takes precedence over ambiguous when both could apply", () => {
    const r = detectAuthorityPolicyRisk({
      rawMessage: "Please approve a 20% discount on the package.",
      authority: vendor(),
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("commercial_terms_authority_insufficient");
    }
  });

  it("ambiguous when binding approval shape and unresolved sender (Phase 3)", () => {
    const r = detectAuthorityPolicyRisk({
      rawMessage: "Please approve the contract addendum.",
      authority: unresolved(),
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("ambiguous_approval_authority");
    }
  });

  it("no hit when only non-binding creative approval (Phase 3)", () => {
    const r = detectAuthorityPolicyRisk({
      rawMessage: "Please approve the timeline only.",
      authority: unresolved(),
    });
    expect(r.hit).toBe(false);
  });

  it("multi-actor: planner material timeline cut (after commercial/ambiguous pass-through)", () => {
    const auth: InboundSenderAuthoritySnapshot = {
      bucket: "planner",
      personId: "pl1",
      isApprovalContact: false,
      source: "thread_sender",
    };
    const r = detectAuthorityPolicyRisk({
      rawMessage:
        "We've revised the day-of timeline — cutting the couple portrait block from 45 to 20 minutes. Please confirm for the team.",
      threadContextSnippet: undefined,
      authority: auth,
      selectedMemorySummaries: [],
      audience: EMPTY_AUDIENCE_MULTI,
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("multi_actor_planner_timeline_reduction_signer");
      expect(r.escalation_reason_code).toBe(
        ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.multi_actor_planner_timeline_reduction_signer,
      );
    }
  });

  it("multi-actor: payer scope/spend without approval contact", () => {
    const auth: InboundSenderAuthoritySnapshot = {
      bucket: "payer",
      personId: "mob1",
      isApprovalContact: false,
      source: "thread_sender",
    };
    const r = detectAuthorityPolicyRisk({
      rawMessage: "Please add two extra hours and confirm the $800 add-on today.",
      authority: auth,
      selectedMemorySummaries: [],
      audience: EMPTY_AUDIENCE_MULTI,
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("multi_actor_payer_scope_spend_signer");
    }
  });

  it("multi-actor: harmless current turn does not hit when snippet contains old planner cut (no smearing into multi-actor)", () => {
    const auth: InboundSenderAuthoritySnapshot = {
      bucket: "planner",
      personId: "pl1",
      isApprovalContact: false,
      source: "thread_sender",
    };
    const r = detectAuthorityPolicyRisk({
      rawMessage: "Sounds good, thanks!",
      threadContextSnippet:
        "Earlier message: we're cutting the couple portrait block from 45 to 20 minutes on the day-of timeline.",
      authority: auth,
      selectedMemorySummaries: [],
      audience: EMPTY_AUDIENCE_MULTI,
    });
    expect(r.hit).toBe(false);
  });
});
