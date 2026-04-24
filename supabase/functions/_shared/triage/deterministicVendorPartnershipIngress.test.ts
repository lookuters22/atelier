import { describe, expect, it } from "vitest";
import { evaluateDeterministicBillingAccountIngress } from "./deterministicBillingAccountIngress.ts";
import { evaluateDeterministicVendorPartnershipIngress } from "./deterministicVendorPartnershipIngress.ts";

describe("evaluateDeterministicVendorPartnershipIngress", () => {
  it("matches SEO / link-building agency outreach (vendor_solicitation) with readable reason codes", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "SEO audit + link-building outreach for your studio",
      body:
        "Hi,\nWe are a digital marketing agency specializing in link building campaigns for creative studios.\nBest,\nAlex",
    });
    expect(r).toMatchObject({ match: true, sender_role: "vendor_solicitation" });
    if (r.match) {
      expect(r.reason_codes.length).toBeGreaterThan(0);
      expect(r.reason_codes.some((c) => c.startsWith("vendor_"))).toBe(true);
      expect(r.reason_codes.every((c) => !c.includes(":0"))).toBe(true);
    }
  });

  it("matches editorial / partnership pitch (partnership_or_collaboration)", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Editorial opportunity — spring issue",
      body:
        "Hello,\nWe have an editorial opportunity to feature your photography in our spring issue.\nThanks,\nJordan",
    });
    expect(r).toMatchObject({
      match: true,
      sender_role: "partnership_or_collaboration",
    });
    if (r.match) {
      expect(r.reason_codes.some((c) => c.startsWith("partnership_"))).toBe(true);
    }
  });

  it("matches feature-your-work only with publication context (partnership)", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Contributor spotlight",
      body: "We’d like to feature your brand in our online magazine’s December column.",
    });
    expect(r).toMatchObject({
      match: true,
      sender_role: "partnership_or_collaboration",
    });
    if (r.match) {
      expect(r.reason_codes).toContain("partnership_editorial_feature_publication_context");
    }
  });

  it("does not match feature language without publication / desk context", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Launch week content",
      body: "We want to feature your studio in our internal stakeholder deck for the campaign.",
    });
    expect(r.match).toBe(false);
  });

  it("does not match real commercial inquiry (campaign / launch / collaboration hiring language)", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Spring campaign — collaboration on visuals",
      body:
        "Hi,\nWe're lining up partners for our spring campaign and would love to explore having your studio capture launch week.\nWhat's your typical package for a two-day brand shoot?\nThanks,\nSam",
    });
    expect(r.match).toBe(false);
  });

  it("does not match wedding / event inquiry with pricing / availability", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "June celebration — packages?",
      body:
        "Hello,\nWe're planning our reception for June 14 and would love to check your availability.\nCould you send us a quote for full-day coverage?\nBest,\nRiley",
    });
    expect(r.match).toBe(false);
  });

  it("does not match video / production inquiry", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Brand documentary — production timeline",
      body:
        "Hi,\nWe're producing a brand documentary and need video production for our launch.\nAre you available the week of May 12?\nThanks,\nMorgan",
    });
    expect(r.match).toBe(false);
  });

  it("does not match generic business networking with weak language only", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Catching up",
      body:
        "Hope you're doing well.\nI'd love to connect and explore synergies between our companies when you have time.\nBest,\nChris",
    });
    expect(r.match).toBe(false);
  });

  it("does not match payment-plan style client mail (stays out of vendor/partnership)", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Payment plan question for our shoot",
      body: "Can we split the deposit across two cards? Thanks!",
    });
    expect(r.match).toBe(false);
  });

  it("does not match marketing collaboration that is hiring the studio for a campaign", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Q4 campaign — marketing collaboration",
      body:
        "Hi,\nWe're reaching out about a marketing collaboration for our Q4 campaign.\nWe want to hire your studio for content capture during launch week.\nBest,\nTaylor",
    });
    expect(r.match).toBe(false);
  });

  it("does not match discuss collaboration on our campaign (client-side)", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Collaboration on our holiday launch",
      body:
        "Could we discuss a collaboration on our campaign visuals?\nWe need a studio to lead capture for our brand film.\nThanks,\nJordan",
    });
    expect(r.match).toBe(false);
  });

  it("yields no match when billing/account is the stronger signal (billing precedence)", () => {
    const subject = "Re: Invoice #1042 — partnership on payment terms";
    const body =
      "Please remit by Friday.\nIBAN: DE89370400440532013000\nSeparately, we also have a partnership proposal.";

    expect(evaluateDeterministicBillingAccountIngress({ subject, body }).match).toBe(true);

    const r = evaluateDeterministicVendorPartnershipIngress({ subject, body });
    expect(r.match).toBe(false);
  });

  it("matches vendor via two independent body markers when no unambiguous regex applies", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Quick intro",
      body:
        "Hi,\nOur agency specializes in paid social. Our cold email outreach program targets creative leads.\nThanks,\nPat",
    });
    expect(r).toMatchObject({ match: true, sender_role: "vendor_solicitation" });
    if (r.match) {
      expect(r.reason_codes).toContain("vendor_agency_markers_2");
      expect(r.reason_codes).toContain("vendor_body_our_agency_specializes");
      expect(r.reason_codes).toContain("vendor_body_cold_email_outreach");
    }
  });

  it("does not match a single generic body phrase alone", () => {
    const r = evaluateDeterministicVendorPartnershipIngress({
      subject: "Hello",
      body: "Our agency specializes in storytelling for brands like yours.",
    });
    expect(r.match).toBe(false);
  });
});
