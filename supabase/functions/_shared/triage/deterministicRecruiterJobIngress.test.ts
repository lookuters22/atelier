import { describe, expect, it } from "vitest";
import { evaluateDeterministicBillingAccountIngress } from "./deterministicBillingAccountIngress.ts";
import { evaluateDeterministicRecruiterJobIngress } from "./deterministicRecruiterJobIngress.ts";
import { evaluateDeterministicVendorPartnershipIngress } from "./deterministicVendorPartnershipIngress.ts";

describe("evaluateDeterministicRecruiterJobIngress", () => {
  it("matches technical recruiter / hiring outreach (recruiter_or_job_outreach)", () => {
    const r = evaluateDeterministicRecruiterJobIngress({
      subject: "Full-time producer role — remote-friendly",
      body:
        "Hi,\nI'm a technical recruiter at Northwind. We have a full-time role at a Bay Area post house.\nCould you share an updated resume if you're open to a chat?\nThanks,\nMorgan",
    });
    expect(r).toMatchObject({
      match: true,
      sender_role: "recruiter_or_job_outreach",
    });
    if (r.match) {
      expect(r.reason_codes.length).toBeGreaterThan(0);
      expect(r.reason_codes.every((c) => !c.includes(":0"))).toBe(true);
    }
  });

  it("matches staffing / placement style outreach via medium-signal pairs", () => {
    const r = evaluateDeterministicRecruiterJobIngress({
      subject: "Motion design — contract opening",
      body:
        "Hello,\nOur recruitment team has an open role for a 3-month motion contract.\nLet me know if you're interested.\nBest,\nRavi",
    });
    expect(r).toMatchObject({
      match: true,
      sender_role: "recruiter_or_job_outreach",
    });
    if (r.match) {
      expect(r.reason_codes).toContain("recruiter_evidence_medium_2");
    }
  });

  it("does not match a real client / project inquiry", () => {
    const r = evaluateDeterministicRecruiterJobIngress({
      subject: "Spring campaign — collaboration on visuals",
      body:
        "Hi,\nWe're lining up partners for our spring campaign and would love to explore having your studio capture launch week.\nWhat's your typical package for a two-day brand shoot?\nThanks,\nSam",
    });
    expect(r.match).toBe(false);
  });

  it("does not match on a single weak phrase like job opportunity alone", () => {
    const r = evaluateDeterministicRecruiterJobIngress({
      subject: "Exciting opportunity",
      body: "We think there's an exciting opportunity to work together on creative projects.",
    });
    expect(r.match).toBe(false);
  });

  it("billing deterministic match still wins (no recruiter match)", () => {
    const subject = "Re: Invoice #901 — contract role follow-up";
    const body =
      "Please see invoice #901 attached.\nTalent acquisition also asked me to mention a contract role.";

    expect(evaluateDeterministicBillingAccountIngress({ subject, body }).match).toBe(true);
    expect(evaluateDeterministicRecruiterJobIngress({ subject, body }).match).toBe(false);
  });

  it("vendor/partnership deterministic match still wins (no recruiter match)", () => {
    const subject = "Hiring: SEO lead — digital marketing agency";
    const body =
      "We're a digital marketing agency scaling our SEO pod.\nPlease send your resume if you have link-building experience.\nThanks,\nPat";

    expect(evaluateDeterministicVendorPartnershipIngress({ subject, body }).match).toBe(true);
    expect(evaluateDeterministicRecruiterJobIngress({ subject, body }).match).toBe(false);
  });

  it("partnership / editorial deterministic match wins over resume request", () => {
    const subject = "Editorial opportunity — contributor program";
    const body =
      "We have an editorial opportunity for contributors.\nPlease send your resume and portfolio for consideration.\nThanks,\nEdits Desk";

    expect(evaluateDeterministicVendorPartnershipIngress({ subject, body }).match).toBe(true);
    expect(evaluateDeterministicRecruiterJobIngress({ subject, body }).match).toBe(false);
  });
});
