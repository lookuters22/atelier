/**
 * Consultation-first inquiry voice realization — prompt fragments and user addendum.
 */
import { describe, expect, it } from "vitest";
import { buildPersonaAntiBrochureConstraintsSection } from "./personaAntiBrochureConstraints.ts";
import {
  buildConsultationFirstInquiryUserHintBlock,
  PERSONA_CONSULTATION_FIRST_ANTI_FUNNEL_BOILERPLATE_SUBSTRING,
  PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER,
} from "./personaConsultationFirstRealization.ts";

describe("personaConsultationFirstRealization", () => {
  it("user addendum contains the section marker and anti-funnel boilerplate instruction", () => {
    const b = buildConsultationFirstInquiryUserHintBlock();
    expect(b).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
    expect(b).toContain(PERSONA_CONSULTATION_FIRST_ANTI_FUNNEL_BOILERPLATE_SUBSTRING);
    expect(b).toMatch(/lead photographer/i);
  });

  it("anti-brochure section wires consultation-first realization marker into funnel rule", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
    expect(s).toContain("consultation_first inquiry + call CTA");
  });
});
