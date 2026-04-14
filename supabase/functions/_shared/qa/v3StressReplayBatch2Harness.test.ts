import { describe, expect, it } from "vitest";
import { executeToolVerifier } from "../tools/toolVerifier.ts";
import { evaluateDecisionPoint } from "./v3StressReplayBatch1Harness.ts";
import { BATCH2_DECISION_POINTS } from "./v3StressReplayBatch2Harness.ts";

describe("v3StressReplayBatch2Harness", () => {
  it("st7 Infinity B2B: identity_entity_routing_safe", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st7-infinity-b2b-package-followup");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.identityEntityPhase2Detected).toBe(true);
    expect(r.resultClass).toBe("identity_entity_routing_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st4 album spread swap: visual_asset_verification_safe", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st4-album-spread-swap-visual");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.visualAssetVerificationDetected).toBe(true);
    expect(r.resultClass).toBe("visual_asset_verification_safe");
  });

  it("st5 planner budget cap: authority_policy_safe", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st5-planner-budget-39k-to-30k");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.authorityPolicyDetected).toBe(true);
    expect(r.resultClass).toBe("authority_policy_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st4 planner passport PII: sensitive_identity_document_safe (not safe_draft_path)", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st4-planner-passport-pii-thread");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.sensitivePersonalDocumentDetected).toBe(true);
    expect(r.resultClass).toBe("sensitive_identity_document_safe");
    expect(r.operatorRoutingProposed).toBe(true);
    expect(r.resultClass).not.toBe("safe_draft_path");
  });

  it("st4 client jumbo album: high_magnitude_client_concession_safe", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st4-client-jumbo-album-discount");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.highMagnitudeClientConcessionDetected).toBe(true);
    expect(r.resultClass).toBe("high_magnitude_client_concession_safe");
    expect(r.operatorRoutingProposed).toBe(true);
    expect(r.resultClass).not.toBe("safe_draft_path");
  });

  it("st7 client hard cap: high_magnitude_client_concession_safe", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st7-client-hard-cap-reduce-price");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.highMagnitudeClientConcessionDetected).toBe(true);
    expect(r.resultClass).toBe("high_magnitude_client_concession_safe");
    expect(r.operatorRoutingProposed).toBe(true);
    expect(r.resultClass).not.toBe("safe_draft_path");
  });

  it("st3 cash VAT: irregular_settlement_safe (not ordinary safe_draft_path)", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st3-cash-commission-vat-avoidance");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.irregularSettlementDetected).toBe(true);
    expect(r.bankingComplianceExceptionDetected).toBe(false);
    expect(r.authorityPolicyDetected).toBe(false);
    expect(r.resultClass).toBe("irregular_settlement_safe");
    expect(r.operatorRoutingProposed).toBe(true);
    expect(r.resultClass).not.toBe("safe_draft_path");
  });

  it("st7 dual CRM rows: identity_ambiguity_safe", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st7-dual-quote-same-couple-thread-weddings");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.multiWeddingIdentityAmbiguous).toBe(true);
    expect(r.identityEntityPhase2Detected).toBe(false);
    expect(r.resultClass).toBe("identity_ambiguity_safe");
  });

  it("st5 agency commission fee move: authority_policy_safe", async () => {
    const dp = BATCH2_DECISION_POINTS.find((d) => d.id === "st5-agency-commission-absorb-wire-fee");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.authorityPolicyDetected).toBe(true);
    expect(r.resultClass).toBe("authority_policy_safe");
  });

  it("batch 2 decision point count is stable", () => {
    expect(BATCH2_DECISION_POINTS.length).toBe(21);
  });
});
