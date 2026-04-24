import { describe, expect, it } from "vitest";
import {
  buildDeterministicOperatorReviewRoutingMetadata,
  DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS,
  emailIngressSubjectLineFromPayload,
  evaluateDeterministicHumanNonClientIngress,
} from "./deterministicOperatorReviewIngress.ts";

describe("deterministicOperatorReviewIngress", () => {
  it("buildDeterministicOperatorReviewRoutingMetadata keeps a consistent base shape across slices", () => {
    const billing = buildDeterministicOperatorReviewRoutingMetadata({
      sender_role: "billing_or_account_followup",
      summary: "Billing summary.",
      routing_layer: DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS.billing_account,
      reason_codes: ["subject_billing_strong"],
      reason_codes_field: "deterministic_billing_reason_codes",
    });
    expect(billing).toEqual({
      routing_disposition: "unresolved_human",
      sender_role: "billing_or_account_followup",
      sender_role_confidence: "high",
      sender_role_reason: "Billing summary.",
      routing_layer: "deterministic_billing_account_ingress_v1",
      deterministic_billing_reason_codes: ["subject_billing_strong"],
    });

    const vp = buildDeterministicOperatorReviewRoutingMetadata({
      sender_role: "vendor_solicitation",
      summary: "Vendor summary.",
      routing_layer: DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS.vendor_partnership,
      reason_codes: ["vendor_seo_services"],
      reason_codes_field: "deterministic_vendor_partnership_reason_codes",
    });
    expect(vp).toMatchObject({
      routing_disposition: "unresolved_human",
      sender_role_confidence: "high",
      routing_layer: "deterministic_vendor_partnership_ingress_v1",
      deterministic_vendor_partnership_reason_codes: ["vendor_seo_services"],
    });

    const rj = buildDeterministicOperatorReviewRoutingMetadata({
      sender_role: "recruiter_or_job_outreach",
      summary: "Recruiter summary.",
      routing_layer: DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS.recruiter_job,
      reason_codes: ["recruiter_strong_talent_acquisition"],
      reason_codes_field: "deterministic_recruiter_job_reason_codes",
    });
    expect(rj).toMatchObject({
      routing_disposition: "unresolved_human",
      routing_layer: "deterministic_recruiter_job_ingress_v1",
      deterministic_recruiter_job_reason_codes: ["recruiter_strong_talent_acquisition"],
    });
  });

  it("emailIngressSubjectLineFromPayload matches triage subject vs body fallback", () => {
    expect(emailIngressSubjectLineFromPayload({ subject: "Invoice #1" }, "ignored")).toBe("Invoice #1");
    const longBody = "a".repeat(80);
    expect(emailIngressSubjectLineFromPayload({}, longBody)).toBe(longBody.slice(0, 60));
  });
});

describe("evaluateDeterministicHumanNonClientIngress (cross-ingest parity orchestrator)", () => {
  it("matches billing first when copy could also suggest vendor (same as raw-email ordering)", () => {
    const subject = "Re: Invoice #1042 — SEO follow-up";
    const body =
      "Please remit by Friday.\nIBAN: DE89370400440532013000\nWe also offer link-building services.";

    const r = evaluateDeterministicHumanNonClientIngress({ subject, body });
    expect(r).toMatchObject({
      match: true,
      variant: "billing",
      triageReturnStatus: "deterministic_billing_account_operator_review",
    });
    if (r.match && r.variant === "billing") {
      expect(r.routingMetadata.sender_role).toBe("billing_or_account_followup");
      expect(r.routingMetadata.routing_layer).toBe("deterministic_billing_account_ingress_v1");
    }
  });

  it("matches vendor when billing does not (post-ingest thread title + body shape)", () => {
    const r = evaluateDeterministicHumanNonClientIngress({
      subject: "SEO audit intro",
      body: "We are a digital marketing agency. Our cold email outreach program targets creative leads.",
    });
    expect(r).toMatchObject({
      match: true,
      variant: "vendor_partnership",
      triageReturnStatus: "deterministic_vendor_partnership_operator_review",
    });
  });

  it("matches recruiter after vendor path cleared", () => {
    const r = evaluateDeterministicHumanNonClientIngress({
      subject: "Producer opening",
      body: "I'm a technical recruiter at Example Co. Could you share an updated resume?\nThanks.",
    });
    expect(r).toMatchObject({
      match: true,
      variant: "recruiter",
      triageReturnStatus: "deterministic_recruiter_job_operator_review",
    });
    if (r.match && r.variant === "recruiter") {
      expect(r.routingMetadata.sender_role).toBe("recruiter_or_job_outreach");
    }
  });

  it("does not match real client inquiry (Gmail canonical would continue to LLM without this)", () => {
    const r = evaluateDeterministicHumanNonClientIngress({
      subject: "Brand video — availability in Q3?",
      body:
        "Hi,\nWe're producing a launch film and would love to check your availability for late August.\nBest,\nAlex",
    });
    expect(r.match).toBe(false);
  });
});
