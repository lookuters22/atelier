import { describe, expect, it } from "vitest";
import {
  buildPersonaAntiBrochureConstraintsSection,
  PERSONA_ANTI_BROCHURE_SECTION_TITLE,
  PERSONA_BUDGET_DIRECT_FROM_OPENER_SUBSTRING,
  PERSONA_BUDGET_NO_TRANSITION_SUBSTRING,
  PERSONA_BUDGET_OVERRIDE_SECTION_MARKER,
  PERSONA_BUDGET_PLACEHOLDER_LITERAL_SUBSTRING,
  PERSONA_CONCIERGE_WARMTH_SUBSTRING,
  PERSONA_FACTUAL_GROUNDING_SUBSTRING,
  PERSONA_FORMAT_BAN_SUBSTRING,
  PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING,
} from "./personaAntiBrochureConstraints.ts";
import { PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER } from "./personaConsultationFirstRealization.ts";

describe("buildPersonaAntiBrochureConstraintsSection", () => {
  it("includes the section title, concierge warmth, filler examples, budget override pivot, and tightening rules", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain(PERSONA_ANTI_BROCHURE_SECTION_TITLE);
    const idxTitle = s.indexOf(PERSONA_ANTI_BROCHURE_SECTION_TITLE);
    const idxFin = s.indexOf(PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING);
    const idxWarm = s.indexOf(PERSONA_CONCIERGE_WARMTH_SUBSTRING);
    expect(idxFin).toBeGreaterThan(idxTitle);
    expect(idxFin).toBeLessThan(idxWarm);
    expect(s).toContain(PERSONA_CONCIERGE_WARMTH_SUBSTRING);
    expect(s).toContain("exactly one short sentence");
    expect(s).toContain("It's lovely to hear from you.");
    expect(s).toContain("lovely to e-meet");
    expect(s).toContain("Thank you so much for reaching out");
    expect(s).toContain("We're thrilled");
    expect(s).toContain(PERSONA_FORMAT_BAN_SUBSTRING);
    expect(s).toContain("bullet points");
    expect(s).toContain(PERSONA_BUDGET_OVERRIDE_SECTION_MARKER);
    expect(s).toContain(PERSONA_BUDGET_NO_TRANSITION_SUBSTRING);
    expect(s).toContain(PERSONA_BUDGET_PLACEHOLDER_LITERAL_SUBSTRING);
    expect(s).toContain(PERSONA_BUDGET_DIRECT_FROM_OPENER_SUBSTRING);
    expect(s).toContain("I appreciate your transparency");
    expect(s).toContain(PERSONA_FACTUAL_GROUNDING_SUBSTRING);
    expect(s).toContain(PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING);
    expect(s).toContain("You are not an oracle");
    expect(s).toContain("Do not invent");
    expect(s).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
  });
});
