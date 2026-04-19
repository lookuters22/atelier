import { describe, expect, it } from "vitest";
import {
  buildPersonaAntiBrochureConstraintsSection,
  PERSONA_ABSTRACT_LUXURY_VOICE_SUBSTRING,
  PERSONA_ANTI_BROCHURE_SECTION_TITLE,
  PERSONA_BUDGET_DIRECT_FROM_OPENER_SUBSTRING,
  PERSONA_BUDGET_NO_TRANSITION_SUBSTRING,
  PERSONA_BUDGET_OVERRIDE_SECTION_MARKER,
  PERSONA_BUDGET_PLACEHOLDER_LITERAL_SUBSTRING,
  PERSONA_CONCIERGE_WARMTH_SUBSTRING,
  PERSONA_FACTUAL_GROUNDING_SUBSTRING,
  PERSONA_FORMAT_BAN_SUBSTRING,
  PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING,
  PERSONA_REAL_OPERATOR_VOICE_SUBSTRING,
  PERSONA_UNVERIFIED_OFFERING_LANGUAGE_SUBSTRING,
} from "./personaAntiBrochureConstraints.ts";
import {
  PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER,
  PERSONA_SOFT_CALL_REALIZATION_SECTION_MARKER,
} from "./personaConsultationFirstRealization.ts";

describe("buildPersonaAntiBrochureConstraintsSection", () => {
  it("includes real-operator voice anchor, abstract-luxury bans, budget override, and grounding rules", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain(PERSONA_ANTI_BROCHURE_SECTION_TITLE);
    const idxTitle = s.indexOf(PERSONA_ANTI_BROCHURE_SECTION_TITLE);
    const idxFin = s.indexOf(PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING);
    const idxWarm = s.indexOf(PERSONA_CONCIERGE_WARMTH_SUBSTRING);
    expect(idxFin).toBeGreaterThan(idxTitle);
    expect(idxFin).toBeLessThan(idxWarm);
    expect(s).toContain(PERSONA_CONCIERGE_WARMTH_SUBSTRING);
    expect(s).toContain(PERSONA_REAL_OPERATOR_VOICE_SUBSTRING);
    expect(s).toContain(PERSONA_ABSTRACT_LUXURY_VOICE_SUBSTRING);
    expect(s).toContain("one short line");
    expect(s).toContain("Hi [Name],");
    expect(s).toContain("Please don't hesitate to let me know if you have any questions");
    expect(s).toContain("I'm here to help!");
    expect(s).toContain("Thank you so much for reaching out");
    expect(s).toContain("We're **thrilled**");
    expect(s).toContain(PERSONA_FORMAT_BAN_SUBSTRING);
    expect(s).toContain("bullet points");
    expect(s).toContain(PERSONA_BUDGET_OVERRIDE_SECTION_MARKER);
    expect(s).toContain(PERSONA_BUDGET_NO_TRANSITION_SUBSTRING);
    expect(s).toContain(PERSONA_BUDGET_PLACEHOLDER_LITERAL_SUBSTRING);
    expect(s).toContain(PERSONA_BUDGET_DIRECT_FROM_OPENER_SUBSTRING);
    expect(s).toContain("I appreciate your transparency");
    expect(s).toContain(PERSONA_FACTUAL_GROUNDING_SUBSTRING);
    expect(s).toContain(PERSONA_GLOBAL_FINANCIAL_GROUNDING_SUBSTRING);
    expect(s).toContain(PERSONA_UNVERIFIED_OFFERING_LANGUAGE_SUBSTRING);
    expect(s).toContain("Signature:");
    expect(s).toContain("You are not an oracle");
    expect(s).toContain("Do not invent");
    expect(s).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
    expect(s).toContain(PERSONA_SOFT_CALL_REALIZATION_SECTION_MARKER);
  });

  it("bans polished AI-sales abstractions named in product review (voice regression guard)", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain("the vision you're describing");
    expect(s).toContain("collaboration might look");
    expect(s).toContain("the day to unfold");
    expect(s).toContain("resonates with");
    expect(s).toContain("genuinely excited");
    expect(s).toContain("the best next step would be");
  });
});
