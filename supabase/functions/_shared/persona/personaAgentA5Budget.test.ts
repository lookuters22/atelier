import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "../a5MiniClassifierBudget.ts";
import {
  PERSONA_MAX_ORCHESTRATOR_FACTS_CHARS,
  truncatePersonaOrchestratorFactsForModel,
} from "./personaAgentA5Budget.ts";

describe("personaAgentA5Budget", () => {
  it("truncates orchestrator facts at PERSONA_MAX_ORCHESTRATOR_FACTS_CHARS", () => {
    const long = "f".repeat(PERSONA_MAX_ORCHESTRATOR_FACTS_CHARS + 100);
    const out = truncatePersonaOrchestratorFactsForModel(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
