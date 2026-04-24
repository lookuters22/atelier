import { describe, expect, it } from "vitest";
import { evaluateDeterministicBillingAccountIngress } from "./deterministicBillingAccountIngress.ts";

describe("evaluateDeterministicBillingAccountIngress", () => {
  it("matches human invoice / payment style subject (strong signal)", () => {
    const r = evaluateDeterministicBillingAccountIngress({
      subject: "Re: Invoice #1042 — May retainer",
      body: "Hi,\nPlease let us know if you need anything else.\nThanks,\nMaria",
    });
    expect(r.match).toBe(true);
    expect(r).toMatchObject({ match: true });
    if (r.match) expect(r.reason_codes).toContain("subject_billing_strong");
  });

  it("matches multiple banking markers in body with generic subject", () => {
    const r = evaluateDeterministicBillingAccountIngress({
      subject: "Following up",
      body:
        "Please use the following wire transfer details.\nIBAN: DE89370400440532013000\nSWIFT code: COBADEFFXXX\nThanks",
    });
    expect(r.match).toBe(true);
    if (r.match) expect(r.reason_codes.some((c) => c.startsWith("body_billing_markers:"))).toBe(true);
  });

  it("matches finance body marker plus billing-related subject (medium + body)", () => {
    const r = evaluateDeterministicBillingAccountIngress({
      subject: "Outstanding balance — quick question",
      body: "The amount outstanding is listed on the attached statement.",
    });
    expect(r.match).toBe(true);
  });

  it("does not match a normal commercial project inquiry without finance signals", () => {
    const r = evaluateDeterministicBillingAccountIngress({
      subject: "Brand video — availability in Q3?",
      body:
        "Hi,\nWe're producing a launch film and would love to check your availability for late August.\nBest,\nAlex",
    });
    expect(r.match).toBe(false);
  });

  it("does not match a personal event inquiry (no billing markers)", () => {
    const r = evaluateDeterministicBillingAccountIngress({
      subject: "Photography for our celebration next spring",
      body:
        "Hello,\nWe're getting married in May and would like to know your packages and pricing.\nThank you,\nJamie",
    });
    expect(r.match).toBe(false);
  });

  it("does not match generic client mail with only the word payment in subject", () => {
    const r = evaluateDeterministicBillingAccountIngress({
      subject: "Payment plan question for our shoot",
      body: "Can we split the deposit across two cards? Thanks!",
    });
    expect(r.match).toBe(false);
  });
});
