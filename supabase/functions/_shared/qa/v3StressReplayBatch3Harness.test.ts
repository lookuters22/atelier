import { describe, expect, it } from "vitest";
import { proposeClientOrchestratorCandidateActions } from "../orchestrator/proposeClientOrchestratorCandidateActions.ts";
import { executeToolVerifier } from "../tools/toolVerifier.ts";
import {
  BATCH1_DECISION_POINTS,
  buildProposalInput,
  evaluateDecisionPoint,
} from "./v3StressReplayBatch1Harness.ts";
import { BATCH3_DECISION_POINTS, runBatch3Harness } from "./v3StressReplayBatch3Harness.ts";

describe("v3StressReplayBatch3Harness", () => {
  it("batch 3 decision point count is stable", () => {
    expect(BATCH3_DECISION_POINTS.length).toBe(12);
  });

  it("st8 WedLuxe angry vendors: non_commercial_escalation_safe + NC detector", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st8-wedluxe-angry-vendors-13-credits");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.nonCommercialDetected).toBe(true);
    expect(r.resultClass).toBe("non_commercial_escalation_safe");
    expect(r.operatorRoutingProposed).toBe(true);
  });

  it("st8 planner €21.5k pushback: authority_policy_safe", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st8-planner-mark-21500-excessive-quote");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.authorityPolicyDetected).toBe(true);
    expect(r.resultClass).toBe("authority_policy_safe");
  });

  it("st8 RSD invoice: banking_compliance_exception_safe", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st8-rsd-invoice-belgrade-bank");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.bankingComplianceExceptionDetected).toBe(true);
    expect(r.resultClass).toBe("banking_compliance_exception_safe");
  });

  it("st1 planner referral commission renegotiation: authority_policy_safe", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st1-planner-10pct-referral-commission-confirm");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.authorityPolicyDetected).toBe(true);
    expect(r.resultClass).toBe("authority_policy_safe");
  });

  it("st8 Lancaster PL certificate language: banking_compliance_exception_safe + compliance asset library attach", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st8-lancaster-venue-pl-insurance-ids");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.bankingComplianceExceptionDetected).toBe(true);
    expect(r.complianceAssetLibraryAttachProposed).toBe(true);
    expect(r.resultClass).toBe("banking_compliance_exception_safe");
    const p = proposeClientOrchestratorCandidateActions(buildProposalInput(dp!));
    expect(p[0]?.action_key).toBe("v3_compliance_asset_library_attach");
    expect(p[0]?.compliance_asset_library_key).toBe("venue_security_compliance_packet");
  });

  it("st8 Jessica re-scope + budget: high_magnitude_client_concession_safe", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st8-jessica-drop-rehearsal-26400-budget");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.highMagnitudeClientConcessionDetected).toBe(true);
    expect(r.resultClass).toBe("high_magnitude_client_concession_safe");
  });

  it("st2 dual deposit Cambodia vs Italy: identity_entity_routing_safe (IE2 text cues)", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st2-dual-invoice-which-wedding-text-only");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.identityEntityPhase2Detected).toBe(true);
    expect(r.resultClass).toBe("identity_entity_routing_safe");
  });

  it("st8 Alex groom consumer gmail: IE2 does not fire (identity header gap)", async () => {
    const dp = BATCH3_DECISION_POINTS.find((d) => d.id === "st8-alex-groom-direct-preflight-ie2");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.identityEntityPhase2Detected).toBe(false);
    expect(r.resultClass).toBe("safe_draft_path");
  });

  it("batch 1 st8 PR crisis row classifies as non_commercial_escalation_safe (NC in shared harness)", async () => {
    const dp = BATCH1_DECISION_POINTS.find((d) => d.id === "st8-pr-crisis-wedluxe");
    expect(dp).toBeDefined();
    const r = await evaluateDecisionPoint(dp!, executeToolVerifier);
    expect(r.nonCommercialDetected).toBe(true);
    expect(r.resultClass).toBe("non_commercial_escalation_safe");
  });

  it("runBatch3Harness returns one result per decision point", async () => {
    const rows = await runBatch3Harness();
    expect(rows.length).toBe(BATCH3_DECISION_POINTS.length);
  });
});
