/**
 * Consultation-first inquiry voice realization — prompt fragments and user addendum.
 */
import { describe, expect, it } from "vitest";
import { buildPersonaAntiBrochureConstraintsSection } from "./personaAntiBrochureConstraints.ts";
import {
  buildConsultationFirstInquiryUserHintBlock,
  buildSoftCallInquiryUserHintBlock,
  PERSONA_CONSULTATION_FIRST_ANTI_FUNNEL_BOILERPLATE_SUBSTRING,
  PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER,
  PERSONA_SOFT_CALL_REALIZATION_SECTION_MARKER,
} from "./personaConsultationFirstRealization.ts";

describe("personaConsultationFirstRealization", () => {
  it("user addendum contains the section marker and anti-funnel boilerplate instruction", () => {
    const b = buildConsultationFirstInquiryUserHintBlock();
    expect(b).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
    expect(b).toContain(PERSONA_CONSULTATION_FIRST_ANTI_FUNNEL_BOILERPLATE_SUBSTRING);
    expect(b).toMatch(/lead photographer/i);
  });

  it("anti-brochure section wires consultation + soft-call realization markers into funnel rule", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain(PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER);
    expect(s).toContain(PERSONA_SOFT_CALL_REALIZATION_SECTION_MARKER);
  });

  it("soft-call user addendum bans best-next-step and calendar-first steering", () => {
    const b = buildSoftCallInquiryUserHintBlock();
    expect(b).toContain(PERSONA_SOFT_CALL_REALIZATION_SECTION_MARKER);
    expect(b).toMatch(/best next step/i);
    expect(b).toMatch(/book a time/i);
  });
});
