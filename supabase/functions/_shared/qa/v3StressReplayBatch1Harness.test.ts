import { describe, expect, it } from "vitest";
import { executeToolVerifier } from "../tools/toolVerifier.ts";
import {
  BATCH1_DECISION_POINTS,
  evaluateDecisionPoint,
  minimalAudience,
} from "./v3StressReplayBatch1Harness.ts";

describe("v3StressReplayBatch1Harness", () => {
  it("st6 broadcast: high broadcastRisk + auto mode blocks verifier (safe)", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st6-broadcast-vendors");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.verifierSuccess).toBe(false);
    expect(r.orchestratorOutcome).toBe("block");
    expect(r.resultClass).toBe("blocked_or_gated");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st6 compassion pause: proposals downgrade send path (ask likely on primary)", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st6-compassion-pause");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.verifierSuccess).toBe(true);
    const send = r.proposalFamilies.includes("send_message");
    expect(send).toBe(true);
  });

  it("st2 banking Serbia: banking_compliance_exception_safe", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st2-banking-serbia");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.bankingComplianceExceptionDetected).toBe(true);
    expect(r.resultClass).toBe("banking_compliance_exception_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st1 B2B indalo: identity_entity_routing_safe", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st1-b2b-indalo-preflight");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.identityEntityPhase2Detected).toBe(true);
    expect(r.resultClass).toBe("identity_entity_routing_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st1 vendor bulk discount: authority_policy_safe (not ordinary safe_draft_path)", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st1-vendor-authority-bulk-discount");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.authorityPolicyDetected).toBe(true);
    expect(r.resultClass).toBe("authority_policy_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st2 text dual booking without two thread_weddings: identity_entity_routing_safe", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st2-text-dual-booking-no-thread-weddings");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.multiWeddingIdentityAmbiguous).toBe(false);
    expect(r.identityEntityPhase2Detected).toBe(true);
    expect(r.resultClass).toBe("identity_entity_routing_safe");
  });

  it("st6 album mockup typo: visual_asset_verification_safe", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st6-album-mockup-typo");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.visualAssetVerificationDetected).toBe(true);
    expect(r.resultClass).toBe("visual_asset_verification_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st8 NDA vs insurance: banking_compliance_exception_safe", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st8-nda-vs-insurance");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.bankingComplianceExceptionDetected).toBe(true);
    expect(r.resultClass).toBe("banking_compliance_exception_safe");
  });

  it("st2 dual-wedding: multi-wedding thread links → identity_ambiguity_safe (not ordinary safe_draft_path)", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st2-dual-wedding-same-thread");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.verifierSuccess).toBe(true);
    expect(r.multiWeddingIdentityAmbiguous).toBe(true);
    expect(r.resultClass).toBe("identity_ambiguity_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st2 timeline WhatsApp: inferred workflow suppresses routine send_message draftability", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st2-timeline-whatsapp");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.verifierSuccess).toBe(true);
    expect(r.workflowRoutineDraftSuppressed).toBe(true);
    expect(r.resultClass).toBe("workflow_suppresses_routine_send");
  });

  it("minimalAudience supports agency CC lock for operator routing", async () => {
    const dp: Parameters<typeof evaluateDecisionPoint>[0] = {
      id: "tmp",
      stressTest: 8,
      title: "t",
      rawMessage: "test",
      audience: minimalAudience({ agencyCcLock: true, broadcastRisk: "low" }),
      requestedExecutionMode: "draft_only",
      weddingCrmParityHints: null,
      expectedProductBehavior: "",
      primaryGapIfUnmet: "none_observed",
    };
    const r = await evaluateDecisionPoint(dp, executeToolVerifier);
    expect(r.operatorRoutingProposed).toBe(true);
  });
});
