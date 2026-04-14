import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "../a5MiniClassifierBudget.ts";
import {
  PERSONA_WORKER_MAX_ASSISTANT_TEXT_CHARS,
  PERSONA_WORKER_MAX_CONTEXT_FIELD_CHARS,
  PERSONA_WORKER_MAX_RAW_FACTS_CHARS,
  PERSONA_WORKER_MAX_TOOL_OUTPUT_CHARS,
  boundPersonaContextForModel,
  truncatePersonaWorkerAssistantBlocks,
  truncatePersonaWorkerRawFacts,
  truncatePersonaWorkerToolOutput,
} from "./personaWorkerA5Budget.ts";

describe("personaWorkerA5Budget", () => {
  it("caps raw facts", () => {
    const long = "f".repeat(PERSONA_WORKER_MAX_RAW_FACTS_CHARS + 50);
    expect(truncatePersonaWorkerRawFacts(long)).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps context fields via boundPersonaContextForModel", () => {
    const long = "c".repeat(PERSONA_WORKER_MAX_CONTEXT_FIELD_CHARS + 50);
    const out = boundPersonaContextForModel({
      coupleNames: long,
      weddingDate: "9 April 2026",
      location: "X",
      stage: "inquiry",
      studioName: "S",
      managerName: "M",
      photographerNames: "P",
    });
    expect(out.coupleNames).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps tool output", () => {
    const long = JSON.stringify({ chunks: "t".repeat(20000) });
    const out = truncatePersonaWorkerToolOutput(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("truncates only text blocks in assistant turns", () => {
    const longText = "a".repeat(PERSONA_WORKER_MAX_ASSISTANT_TEXT_CHARS + 50);
    const blocks = truncatePersonaWorkerAssistantBlocks([
      { type: "text", text: longText },
      { type: "tool_use", id: "tu_1", name: "search_past_communications", input: { query: "x" } },
    ]);
    expect(blocks[0].type === "text" && blocks[0].text).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
    if (blocks[1].type === "tool_use") {
      expect(blocks[1].input).toEqual({ query: "x" });
    }
  });
});
