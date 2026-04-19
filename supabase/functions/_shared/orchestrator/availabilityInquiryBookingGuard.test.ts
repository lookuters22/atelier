/**
 * Deterministic availability booking-language guard (plan: confirm_availability + booking_terms none).
 */
import { describe, expect, it } from "vitest";
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import {
  auditAvailabilityRestrictedBookingProse,
  isAvailabilityBookingProseRestricted,
} from "./availabilityInquiryBookingGuard.ts";

function plan(partial: Partial<InquiryReplyPlan>): InquiryReplyPlan {
  return {
    schemaVersion: 1,
    inquiry_motion: "qualify_first",
    confirm_availability: true,
    mention_booking_terms: "none",
    budget_clause_mode: "none",
    opening_tone: "reassuring",
    cta_type: "none",
    cta_intensity: "none",
    inquiry_first_step_style_effective: "proactive_call",
    ...partial,
  };
}

describe("availabilityInquiryBookingGuard", () => {
  it("isAvailabilityBookingProseRestricted only for confirm_availability + booking_terms none", () => {
    expect(isAvailabilityBookingProseRestricted(plan({}))).toBe(true);
    expect(
      isAvailabilityBookingProseRestricted(
        plan({ confirm_availability: false, mention_booking_terms: "none" }),
      ),
    ).toBe(false);
    expect(
      isAvailabilityBookingProseRestricted(
        plan({ mention_booking_terms: "verified_specific" }),
      ),
    ).toBe(false);
  });

  it("flags retainer/deposit/% when restricted", () => {
    const pl = plan({});
    const v = auditAvailabilityRestrictedBookingProse(
      "We require a 50% deposit after you sign the contract.",
      pl,
    );
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => /deposit/i.test(x))).toBe(true);
    expect(v.some((x) => /contract signing sequence/i.test(x))).toBe(true);
  });

  it("passes neutral availability prose", () => {
    const pl = plan({});
    expect(
      auditAvailabilityRestrictedBookingProse(
        "Yes — we're open on Saturday, September 12, 2026. Happy to share more detail once you've had a chance to review our work.",
        pl,
      ),
    ).toEqual([]);
  });

  it("flags invoice / secure your date / payment plan drift", () => {
    const pl = plan({});
    expect(auditAvailabilityRestrictedBookingProse("We'll send an invoice for the retainer hold.", pl).length).toBeGreaterThan(0);
    expect(
      auditAvailabilityRestrictedBookingProse("A 30% deposit secures your date on our calendar.", pl).length,
    ).toBeGreaterThan(0);
    expect(auditAvailabilityRestrictedBookingProse("We offer a flexible payment plan for weddings.", pl).length).toBeGreaterThan(0);
  });

  it("with cta:none, flags lead-photographer consultation funnel phrasing", () => {
    const pl = plan({ cta_type: "none" });
    const v = auditAvailabilityRestrictedBookingProse(
      "Our lead photographer can do a brief consultation with you about booking.",
      pl,
    );
    expect(v.length).toBeGreaterThan(0);
  });

  it("returns empty when plan is null", () => {
    expect(auditAvailabilityRestrictedBookingProse("30% retainer", null)).toEqual([]);
  });
});
