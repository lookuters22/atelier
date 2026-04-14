/**
 * Weak availability realization block — marker + anti-mechanics copy for persona user message.
 */
import { describe, expect, it } from "vitest";
import {
  buildWeakAvailabilityInquiryUserHintBlock,
  PERSONA_WEAK_AVAILABILITY_ANTI_MECHANICS_SUBSTRING,
  PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER,
} from "./personaWeakAvailabilityRealization.ts";

describe("personaWeakAvailabilityRealization", () => {
  it("includes stable section marker and committed_terms null instruction", () => {
    const b = buildWeakAvailabilityInquiryUserHintBlock();
    expect(b).toContain(PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER);
    expect(b).toContain(PERSONA_WEAK_AVAILABILITY_ANTI_MECHANICS_SUBSTRING);
    expect(b).toContain("committed_terms");
    expect(b).toContain("deposit_percentage");
    expect(b).toContain("travel_miles_included");
  });

  it("is compact (single addendum, not a second spec)", () => {
    const lines = buildWeakAvailabilityInquiryUserHintBlock().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.length).toBeLessThan(40);
  });
});
