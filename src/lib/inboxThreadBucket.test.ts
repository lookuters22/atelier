import { describe, expect, it } from "vitest";
import {
  DETERMINISTIC_INGRESS_OPERATOR_REVIEW_SENDER_ROLES,
  deriveInboxThreadBucket,
  inboxBucketTodayStatusLabel,
  inboxUnlinkedBucketChipLabel,
  isSuppressedInboxThread,
  readInboxMetadataSenderRole,
  zenLobbyHeroTagForInboxBucket,
} from "./inboxThreadBucket";

function baseUnlinked(meta: unknown) {
  return { weddingId: null as string | null, ai_routing_metadata: meta };
}

describe("isSuppressedInboxThread", () => {
  it("is true when routing_disposition is promo_automated (legacy inbox aligns with main surface)", () => {
    expect(
      isSuppressedInboxThread(
        baseUnlinked({ routing_disposition: "promo_automated", heuristic_reasons: ["x"] }),
      ),
    ).toBe(true);
  });

  it("is false for normal unlinked human mail", () => {
    expect(isSuppressedInboxThread(baseUnlinked({ routing_disposition: "unresolved_human" }))).toBe(
      false,
    );
  });

  it("is false for linked project threads (inquiry bucket)", () => {
    expect(
      isSuppressedInboxThread({
        weddingId: "w-1",
        ai_routing_metadata: { classified_intent: "intake" },
      }),
    ).toBe(false);
  });
});

describe("DETERMINISTIC_INGRESS_OPERATOR_REVIEW_SENDER_ROLES", () => {
  it("is the canonical set of four pre-LLM deterministic operator-review ingress roles", () => {
    expect([...DETERMINISTIC_INGRESS_OPERATOR_REVIEW_SENDER_ROLES].sort()).toEqual(
      [
        "billing_or_account_followup",
        "partnership_or_collaboration",
        "recruiter_or_job_outreach",
        "vendor_solicitation",
      ].sort(),
    );
  });
});

describe("deriveInboxThreadBucket", () => {
  it("suppressed: promo_automated wins even if other fields exist", () => {
    expect(
      deriveInboxThreadBucket(
        baseUnlinked({
          routing_disposition: "promo_automated",
          sender_role: "customer_lead",
        }),
      ),
    ).toBe("suppressed");
  });

  it("inquiry: linked project (wedding_id set)", () => {
    expect(
      deriveInboxThreadBucket({
        weddingId: "w-1",
        ai_routing_metadata: { routing_disposition: "suggested_match_unresolved" },
      }),
    ).toBe("inquiry");
  });

  it("operator_review: billing_or_account_followup on linked project (project link preserved)", () => {
    expect(
      deriveInboxThreadBucket({
        weddingId: "w-1",
        ai_routing_metadata: {
          sender_role: "billing_or_account_followup",
          routing_disposition: "unresolved_human",
          routing_layer: "deterministic_billing_account_ingress_v1",
        },
      }),
    ).toBe("operator_review");
  });

  it("inquiry: linked project with customer_lead stays inquiry", () => {
    expect(
      deriveInboxThreadBucket({
        weddingId: "w-1",
        ai_routing_metadata: { sender_role: "customer_lead" },
      }),
    ).toBe("inquiry");
  });

  it("operator_review: vendor_solicitation on linked project", () => {
    expect(
      deriveInboxThreadBucket({
        weddingId: "w-1",
        ai_routing_metadata: {
          sender_role: "vendor_solicitation",
          routing_layer: "deterministic_vendor_partnership_ingress_v1",
        },
      }),
    ).toBe("operator_review");
  });

  it("operator_review: partnership_or_collaboration on linked project", () => {
    expect(
      deriveInboxThreadBucket({
        weddingId: "w-1",
        ai_routing_metadata: { sender_role: "partnership_or_collaboration" },
      }),
    ).toBe("operator_review");
  });

  it("operator_review: recruiter_or_job_outreach on linked project", () => {
    expect(
      deriveInboxThreadBucket({
        weddingId: "w-1",
        ai_routing_metadata: {
          sender_role: "recruiter_or_job_outreach",
          routing_layer: "deterministic_recruiter_job_ingress_v1",
        },
      }),
    ).toBe("operator_review");
  });

  it("suppressed: promo_automated wins over linked billing_or_account_followup", () => {
    expect(
      deriveInboxThreadBucket({
        weddingId: "w-1",
        ai_routing_metadata: {
          routing_disposition: "promo_automated",
          sender_role: "billing_or_account_followup",
        },
      }),
    ).toBe("suppressed");
  });

  it("inquiry: unlinked customer_lead", () => {
    expect(
      deriveInboxThreadBucket(
        baseUnlinked({
          routing_disposition: "non_wedding_business_inquiry",
          sender_role: "customer_lead",
        }),
      ),
    ).toBe("inquiry");
  });

  it("operator_review: vendor_solicitation", () => {
    expect(
      deriveInboxThreadBucket(
        baseUnlinked({
          routing_disposition: "non_wedding_business_inquiry",
          sender_role: "vendor_solicitation",
        }),
      ),
    ).toBe("operator_review");
  });

  it("operator_review: partnership_or_collaboration", () => {
    expect(
      deriveInboxThreadBucket(baseUnlinked({ sender_role: "partnership_or_collaboration" })),
    ).toBe("operator_review");
  });

  it("operator_review: billing_or_account_followup", () => {
    expect(
      deriveInboxThreadBucket(baseUnlinked({ sender_role: "billing_or_account_followup" })),
    ).toBe("operator_review");
  });

  it("operator_review: recruiter_or_job_outreach", () => {
    expect(
      deriveInboxThreadBucket(baseUnlinked({ sender_role: "recruiter_or_job_outreach" })),
    ).toBe("operator_review");
  });

  it("unfiled: suggested_match_unresolved", () => {
    expect(
      deriveInboxThreadBucket(
        baseUnlinked({
          routing_disposition: "suggested_match_unresolved",
          classified_intent: "intake",
        }),
      ),
    ).toBe("unfiled");
  });

  it("unfiled: near_match_escalation_candidate", () => {
    expect(
      deriveInboxThreadBucket(
        baseUnlinked({ routing_disposition: "near_match_escalation_candidate" }),
      ),
    ).toBe("unfiled");
  });

  it("unfiled: unresolved_human", () => {
    expect(deriveInboxThreadBucket(baseUnlinked({ routing_disposition: "unresolved_human" }))).toBe(
      "unfiled",
    );
  });

  it("unfiled: non_wedding_business_inquiry without customer or operator role", () => {
    expect(
      deriveInboxThreadBucket(
        baseUnlinked({
          routing_disposition: "non_wedding_business_inquiry",
          sender_role: "unclear",
        }),
      ),
    ).toBe("unfiled");
  });

  it("unfiled: empty metadata", () => {
    expect(deriveInboxThreadBucket(baseUnlinked(null))).toBe("unfiled");
  });
});

describe("readInboxMetadataSenderRole", () => {
  it("reads sender_role string", () => {
    expect(readInboxMetadataSenderRole({ sender_role: "vendor_solicitation" })).toBe(
      "vendor_solicitation",
    );
  });
});

describe("inboxBucketTodayStatusLabel", () => {
  it("maps buckets to row status", () => {
    expect(inboxBucketTodayStatusLabel(baseUnlinked({ routing_disposition: "promo_automated" }))).toBe(
      "Suppressed",
    );
    expect(
      inboxBucketTodayStatusLabel(
        baseUnlinked({ sender_role: "customer_lead", routing_disposition: "non_wedding_business_inquiry" }),
      ),
    ).toBe("Inquiry");
    expect(inboxBucketTodayStatusLabel(baseUnlinked({ routing_disposition: "unresolved_human" }))).toBe(
      "Needs filing",
    );
    expect(
      inboxBucketTodayStatusLabel(baseUnlinked({ sender_role: "vendor_solicitation" })),
    ).toBe("Vendor / pitch");
  });

  it("linked billing/account thread uses Billing / account status (operator review lane)", () => {
    expect(
      inboxBucketTodayStatusLabel({
        weddingId: "w-1",
        ai_routing_metadata: { sender_role: "billing_or_account_followup" },
      }),
    ).toBe("Billing / account");
  });
});

describe("zenLobbyHeroTagForInboxBucket", () => {
  it("linked billing/account maps to Billing / account hero tag", () => {
    expect(
      zenLobbyHeroTagForInboxBucket(
        "operator_review",
        "billing_or_account_followup",
      ),
    ).toBe("Billing / account");
  });
});

describe("inboxUnlinkedBucketChipLabel", () => {
  it("matches Today status for operator roles", () => {
    expect(inboxUnlinkedBucketChipLabel(baseUnlinked({ sender_role: "recruiter_or_job_outreach" }))).toBe(
      "Recruiting",
    );
  });
});
