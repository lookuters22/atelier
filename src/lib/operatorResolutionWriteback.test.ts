import { describe, expect, it } from "vitest";
import {
  isPlaybookRuleCandidateReviewStatus,
  parseDecisionMode,
  parseOperatorResolutionWritebackArtifact,
  parseOperatorResolutionWritebackEnvelope,
  parseOptionalConfidence,
  parseOptionalObservationCount,
  parseRuleScope,
  parseThreadChannel,
  truncateBoundedOperatorText,
} from "./operatorResolutionWriteback.ts";
import { OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION } from "../types/operatorResolutionWriteback.types.ts";

function baseCandidateArtifact(overrides: Record<string, unknown> = {}) {
  return {
    kind: "playbook_rule_candidate",
    proposedActionKey: "send_message",
    topic: "pricing",
    proposedInstruction: "Always quote travel separately.",
    proposedDecisionMode: "draft_only",
    proposedScope: "global",
    ...overrides,
  };
}

describe("operatorResolutionWriteback", () => {
  it("isPlaybookRuleCandidateReviewStatus accepts DB statuses only", () => {
    expect(isPlaybookRuleCandidateReviewStatus("candidate")).toBe(true);
    expect(isPlaybookRuleCandidateReviewStatus("approved")).toBe(true);
    expect(isPlaybookRuleCandidateReviewStatus("rejected")).toBe(true);
    expect(isPlaybookRuleCandidateReviewStatus("superseded")).toBe(true);
    expect(isPlaybookRuleCandidateReviewStatus("pending")).toBe(false);
  });

  it("truncateBoundedOperatorText preserves short strings and truncates long", () => {
    expect(truncateBoundedOperatorText("hi")).toBe("hi");
    const long = "x".repeat(9000);
    expect(truncateBoundedOperatorText(long).length).toBeLessThanOrEqual(8000);
    expect(truncateBoundedOperatorText(long).endsWith("…")).toBe(true);
  });

  it("parseDecisionMode / parseRuleScope / parseThreadChannel enforce repo enums", () => {
    expect(parseDecisionMode("auto")).toBe("auto");
    expect(parseDecisionMode("draft_only")).toBe("draft_only");
    expect(parseDecisionMode("not_a_mode")).toBeNull();
    expect(parseRuleScope("global")).toBe("global");
    expect(parseRuleScope("channel")).toBe("channel");
    expect(parseRuleScope("tenant")).toBeNull();
    expect(parseThreadChannel("email")).toBe("email");
    expect(parseThreadChannel("fax")).toBeNull();
  });

  it("parseOptionalConfidence accepts bounds and rejects invalid", () => {
    expect(parseOptionalConfidence(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseOptionalConfidence(null)).toEqual({ ok: true, value: undefined });
    expect(parseOptionalConfidence(0)).toEqual({ ok: true, value: 0 });
    expect(parseOptionalConfidence(1)).toEqual({ ok: true, value: 1 });
    expect(parseOptionalConfidence(0.5)).toEqual({ ok: true, value: 0.5 });
    expect(parseOptionalConfidence(-0.01)).toEqual({ ok: false });
    expect(parseOptionalConfidence(1.01)).toEqual({ ok: false });
    expect(parseOptionalConfidence(Number.NaN)).toEqual({ ok: false });
    expect(parseOptionalConfidence(Number.POSITIVE_INFINITY)).toEqual({ ok: false });
    expect(parseOptionalConfidence("0.5")).toEqual({ ok: false });
  });

  it("parseOptionalObservationCount accepts integers >= 1 or omit", () => {
    expect(parseOptionalObservationCount(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseOptionalObservationCount(null)).toEqual({ ok: true, value: undefined });
    expect(parseOptionalObservationCount(1)).toEqual({ ok: true, value: 1 });
    expect(parseOptionalObservationCount(42)).toEqual({ ok: true, value: 42 });
    expect(parseOptionalObservationCount(0)).toEqual({ ok: false });
    expect(parseOptionalObservationCount(-1)).toEqual({ ok: false });
    expect(parseOptionalObservationCount(1.5)).toEqual({ ok: false });
    expect(parseOptionalObservationCount(Number.NaN)).toEqual({ ok: false });
  });

  it("parseOperatorResolutionWritebackEnvelope parses multi-artifact envelope", () => {
    const parsed = parseOperatorResolutionWritebackEnvelope({
      schemaVersion: OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION,
      photographerId: "p1",
      correlation: { escalationId: "e1", weddingId: "w1" },
      artifacts: [
        {
          kind: "authorized_case_exception",
          overridesActionKey: "send_message",
          overridePayload: { decision_mode: "draft_only" },
        },
        {
          kind: "memory",
          memoryType: "case_note",
          title: "t",
          summary: "s",
          fullContent: "c",
        },
        {
          kind: "playbook_rule_candidate",
          proposedActionKey: "send_message",
          topic: "pricing",
          proposedInstruction: "Always quote travel separately.",
          proposedDecisionMode: "draft_only",
          proposedScope: "global",
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.artifacts).toHaveLength(3);
    expect(parsed!.artifacts[2].kind).toBe("playbook_rule_candidate");
    if (parsed!.artifacts[2].kind === "playbook_rule_candidate") {
      expect(parsed!.artifacts[2].proposedDecisionMode).toBe("draft_only");
    }
  });

  it("parseOperatorResolutionWritebackArtifact rejects invalid playbook_rule_candidate", () => {
    expect(
      parseOperatorResolutionWritebackArtifact({
        kind: "playbook_rule_candidate",
        proposedActionKey: "",
        topic: "x",
        proposedInstruction: "y",
        proposedDecisionMode: "auto",
        proposedScope: "global",
      }),
    ).toBeNull();
  });

  it("rejects invalid proposedDecisionMode and proposedScope", () => {
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ proposedDecisionMode: "human_only" }))).toBeNull();
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ proposedScope: "globalx" }))).toBeNull();
  });

  it("rejects invalid proposedChannel when set", () => {
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ proposedChannel: "sms" }))).toBeNull();
    expect(
      parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ proposedChannel: "web" }))?.kind,
    ).toBe("playbook_rule_candidate");
  });

  it("rejects invalid confidence", () => {
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ confidence: -0.001 }))).toBeNull();
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ confidence: 2 }))).toBeNull();
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ confidence: Number.NaN }))).toBeNull();
  });

  it("rejects invalid observationCount", () => {
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ observationCount: 0 }))).toBeNull();
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ observationCount: -3 }))).toBeNull();
    expect(parseOperatorResolutionWritebackArtifact(baseCandidateArtifact({ observationCount: 2.2 }))).toBeNull();
  });

  it("allows omitted confidence and observationCount on candidate", () => {
    const a = parseOperatorResolutionWritebackArtifact(baseCandidateArtifact());
    expect(a?.kind).toBe("playbook_rule_candidate");
    if (a?.kind === "playbook_rule_candidate") {
      expect(a.confidence).toBeUndefined();
      expect(a.observationCount).toBeUndefined();
    }
  });

  it("rejects envelope if any artifact is invalid", () => {
    expect(
      parseOperatorResolutionWritebackEnvelope({
        schemaVersion: OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION,
        photographerId: "p1",
        correlation: {},
        artifacts: [baseCandidateArtifact({ proposedDecisionMode: "bogus" })],
      }),
    ).toBeNull();
  });

  it("rejects memory with empty memoryType", () => {
    expect(
      parseOperatorResolutionWritebackArtifact({
        kind: "memory",
        memoryType: "   ",
        title: "t",
        summary: "s",
        fullContent: "c",
      }),
    ).toBeNull();
  });
});
