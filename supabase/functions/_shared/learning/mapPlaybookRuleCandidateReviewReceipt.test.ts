import { describe, expect, it } from "vitest";
import { mapPlaybookRuleCandidateReviewReceipt } from "./mapPlaybookRuleCandidateReviewReceipt.ts";
import { toReviewPlaybookRuleCandidateRpcArgs } from "./reviewPlaybookRuleCandidateRpc.ts";

describe("mapPlaybookRuleCandidateReviewReceipt", () => {
  it("parses approve without overrides", () => {
    const r = mapPlaybookRuleCandidateReviewReceipt({
      action: "approve",
      candidate_id: "c1",
      review_status: "approved",
      playbook_rule_id: "r1",
      used_overrides: false,
      approved_action_key: "send_quote",
      approved_decision_mode: "auto",
      approved_instruction: "x",
      approved_topic: "t",
    });
    expect(r.action).toBe("approve");
    if (r.action !== "approve") throw new Error("narrow");
    expect(r.used_overrides).toBe(false);
    expect(r.approved_decision_mode).toBe("auto");
  });

  it("parses approve with overrides flag", () => {
    const r = mapPlaybookRuleCandidateReviewReceipt({
      action: "approve",
      candidate_id: "c1",
      review_status: "approved",
      playbook_rule_id: "r1",
      used_overrides: true,
      approved_action_key: "other",
      approved_decision_mode: "ask_first",
      approved_instruction: "y",
      approved_topic: "",
    });
    expect(r.action).toBe("approve");
    if (r.action !== "approve") throw new Error("narrow");
    expect(r.used_overrides).toBe(true);
    expect(r.approved_topic).toBe("");
  });

  it("parses reject", () => {
    const r = mapPlaybookRuleCandidateReviewReceipt({
      action: "reject",
      candidate_id: "c1",
      review_status: "rejected",
    });
    expect(r.action).toBe("reject");
  });

  it("parses supersede with nullable superseded_by", () => {
    const r = mapPlaybookRuleCandidateReviewReceipt({
      action: "supersede",
      candidate_id: "c1",
      review_status: "superseded",
      superseded_by_candidate_id: null,
    });
    expect(r.action).toBe("supersede");
    if (r.action !== "supersede") throw new Error("narrow");
    expect(r.superseded_by_candidate_id).toBeNull();
  });
});

describe("toReviewPlaybookRuleCandidateRpcArgs", () => {
  it("maps approve with overrides to RPC args", () => {
    const args = toReviewPlaybookRuleCandidateRpcArgs("p1", {
      candidate_id: "c1",
      action: "approve",
      override_instruction: "inst",
      override_action_key: "k",
      override_decision_mode: "draft_only",
      override_topic: "topic",
    });
    expect(args).toEqual({
      p_photographer_id: "p1",
      p_candidate_id: "c1",
      p_action: "approve",
      p_superseded_by_candidate_id: null,
      p_override_instruction: "inst",
      p_override_action_key: "k",
      p_override_decision_mode: "draft_only",
      p_override_topic: "topic",
    });
  });

  it("maps supersede with superseded_by", () => {
    const args = toReviewPlaybookRuleCandidateRpcArgs("p1", {
      candidate_id: "c1",
      action: "supersede",
      superseded_by_candidate_id: "c2",
    });
    expect(args.p_superseded_by_candidate_id).toBe("c2");
    expect(args.p_action).toBe("supersede");
  });
});
