/**
 * Ensures Ana style examples are injected on the real `buildPersonaSystemPrompt` path (not only the standalone formatter).
 */
import { describe, expect, it } from "vitest";
import {
  buildPersonaSystemPrompt,
  type PersonaWriterInputBoundary,
} from "./personaAgent.ts";
import {
  PERSONA_ANTI_BROCHURE_SECTION_TITLE,
  PERSONA_BUDGET_OVERRIDE_SECTION_MARKER,
  PERSONA_BUDGET_PLACEHOLDER_LITERAL_SUBSTRING,
  PERSONA_CONCIERGE_WARMTH_SUBSTRING,
  PERSONA_FACTUAL_GROUNDING_SUBSTRING,
  PERSONA_FORMAT_BAN_SUBSTRING,
  PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING,
} from "../prompts/personaAntiBrochureConstraints.ts";
import { PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER } from "../prompts/personaConsultationFirstRealization.ts";
import {
  PERSONA_STYLE_EXAMPLES_NOT_FACTUAL,
  PERSONA_STYLE_EXAMPLES_SECTION_TITLE,
} from "../prompts/personaStudioVoiceExamples.ts";

describe("buildPersonaSystemPrompt — Ana voice anchor wiring", () => {
  const minimalBoundary: PersonaWriterInputBoundary = {
    narrowPersonalization: { coupleNames: null, location: null, weddingDate: null },
    limitedContinuityMemoryHeaders: [],
  };

  it("includes the style examples section and Ana inquiry line from the shared formatter", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toContain(PERSONA_STYLE_EXAMPLES_SECTION_TITLE);
    expect(system).toContain(PERSONA_STYLE_EXAMPLES_NOT_FACTUAL);
    expect(system).toContain("My name is Ana");
  });

  it("uses softened identity copy (not legacy luxury/premium lead)", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toContain("You are Ana, the client manager");
    expect(system).not.toMatch(/luxury wedding photography studio manager/i);
    expect(system).not.toMatch(/premium, never salesy/i);
  });

  it("points to style examples as primary cadence anchor before factual CRM block", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    const idxStyle = system.indexOf(PERSONA_STYLE_EXAMPLES_SECTION_TITLE);
    const idxCrm = system.indexOf("Authoritative CRM (verified tenant record)");
    expect(idxStyle).toBeGreaterThan(-1);
    expect(idxCrm).toBeGreaterThan(-1);
    expect(idxStyle).toBeLessThan(idxCrm);
  });

  it("includes anti-brochure constraints after style examples and before CRM facts block", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    const idxStyle = system.indexOf(PERSONA_STYLE_EXAMPLES_SECTION_TITLE);
    const idxAnti = system.indexOf(PERSONA_ANTI_BROCHURE_SECTION_TITLE);
    const idxCrm = system.indexOf("Authoritative CRM (verified tenant record)");
    expect(idxAnti).toBeGreaterThan(-1);
    expect(idxStyle).toBeLessThan(idxAnti);
    expect(idxAnti).toBeLessThan(idxCrm);
    expect(system).toContain(PERSONA_CONCIERGE_WARMTH_SUBSTRING);
    expect(system).toContain(PERSONA_FORMAT_BAN_SUBSTRING);
    expect(system).toContain(PERSONA_BUDGET_OVERRIDE_SECTION_MARKER);
    expect(system).toContain(PERSONA_BUDGET_PLACEHOLDER_LITERAL_SUBSTRING);
    expect(system).toContain(PERSONA_FACTUAL_GROUNDING_SUBSTRING);
    expect(system).toContain(PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING);
  });

  it("includes consultation-first realization pointer for inquiry voice tightening", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
    expect(system).toContain("[INQUIRY_ONBOARDING]");
  });
});
