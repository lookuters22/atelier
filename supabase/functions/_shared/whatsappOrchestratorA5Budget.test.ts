import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  WHATSAPP_ORCH_MAX_SANITIZED_CONTEXT_JSON_CHARS,
  WHATSAPP_ORCH_MAX_TOOL_OUTPUT_CHARS,
  WHATSAPP_ORCH_MAX_USER_MESSAGE_CHARS,
  truncateWhatsappOrchestratorSanitizedContextJson,
  truncateWhatsappOrchestratorToolOutput,
  truncateWhatsappOrchestratorUserMessage,
} from "./whatsappOrchestratorA5Budget.ts";

describe("whatsappOrchestratorA5Budget", () => {
  it("caps user message", () => {
    const long = "m".repeat(WHATSAPP_ORCH_MAX_USER_MESSAGE_CHARS + 100);
    const out = truncateWhatsappOrchestratorUserMessage(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps sanitized context JSON string", () => {
    const json = JSON.stringify({ a: "x".repeat(WHATSAPP_ORCH_MAX_SANITIZED_CONTEXT_JSON_CHARS) });
    const out = truncateWhatsappOrchestratorSanitizedContextJson(json);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps tool output", () => {
    const long = JSON.stringify({ rows: Array(4000).fill("z") });
    const out = truncateWhatsappOrchestratorToolOutput(long);
    expect(out.length).toBeLessThanOrEqual(
      WHATSAPP_ORCH_MAX_TOOL_OUTPUT_CHARS + A5_MINI_CLASSIFIER_TRUNCATE_MARKER.length + 8,
    );
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
