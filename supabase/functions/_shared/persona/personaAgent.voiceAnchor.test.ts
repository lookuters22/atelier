/**
 * Ensures Ana style examples are injected on the real `buildPersonaSystemPrompt` path (not only the standalone formatter).
 */
import { describe, expect, it } from "vitest";
import {
  buildPersonaSystemPrompt,
  buildPersonaUserMessage,
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
  PERSONA_UNVERIFIED_OFFERING_LANGUAGE_SUBSTRING,
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

  it("uses client-manager operator identity (not legacy luxury/premium lead)", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toContain("client manager");
    expect(system).toContain("Voice precedence:");
    expect(system).toContain("ANA_OPERATOR_VOICE_PRECEDENCE.md");
    expect(system).toContain("not a chatbot");
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
    expect(system).toContain(PERSONA_UNVERIFIED_OFFERING_LANGUAGE_SUBSTRING);
  });

  it("includes consultation-first realization pointer for inquiry voice tightening", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
    expect(system).toContain("[INQUIRY_ONBOARDING]");
    expect(system).toContain("Deterministic post-audit");
    expect(system).toContain("unsupported business");
  });

  it("includes inquiry claim permission contract rails (system + user wrapper)", () => {
    const system = buildPersonaSystemPrompt(minimalBoundary);
    expect(system).toContain("Claim permission contract");
    expect(system).toContain("inquiry claim permissions");
    const user = buildPersonaUserMessage("=== facts ===\n");
    expect(user).toContain("Claim permissions (authoritative for this turn)");
    expect(user).toMatch(/outranks.*continuity/);
  });

  it("user message wrapper marks briefing_voice_v1 as tone-only, not factual authorization", () => {
    const user = buildPersonaUserMessage("=== facts ===\n");
    expect(user).toContain("briefing_voice_v1");
    expect(user).toContain("does **not** authorize factual claims");
    expect(user).toContain("ignore the excerpt");
  });
});
