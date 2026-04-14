import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  OPERATOR_ORCH_MAX_CHAT_MESSAGE_CHARS,
  OPERATOR_ORCH_MAX_TOOL_OUTPUT_CHARS,
  truncateOperatorOrchestratorChatMessage,
  truncateOperatorOrchestratorEscalationQuestion,
  truncateOperatorOrchestratorEscalationReply,
  truncateOperatorOrchestratorToolOutput,
} from "./operatorOrchestratorA5Budget.ts";

describe("operatorOrchestratorA5Budget", () => {
  it("truncates chat messages at OPERATOR_ORCH_MAX_CHAT_MESSAGE_CHARS", () => {
    const long = "x".repeat(OPERATOR_ORCH_MAX_CHAT_MESSAGE_CHARS + 50);
    const out = truncateOperatorOrchestratorChatMessage(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("truncates tool output at OPERATOR_ORCH_MAX_TOOL_OUTPUT_CHARS", () => {
    const long = `{"rows":${JSON.stringify(Array(5000).fill("y"))}}`;
    const out = truncateOperatorOrchestratorToolOutput(long);
    expect(out.length).toBeLessThanOrEqual(OPERATOR_ORCH_MAX_TOOL_OUTPUT_CHARS + A5_MINI_CLASSIFIER_TRUNCATE_MARKER.length + 10);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("uses escalation question/reply caps", () => {
    const q = "q".repeat(9000);
    expect(truncateOperatorOrchestratorEscalationQuestion(q).length).toBeLessThan(q.length);
    const r = "r".repeat(15000);
    expect(truncateOperatorOrchestratorEscalationReply(r).length).toBeLessThan(r.length);
  });
});
